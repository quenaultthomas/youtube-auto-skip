// YouTube Auto Skip — content script
// Détecte le bouton « Ignorer » des publicités et clique dessus dès qu'il est visible.

(() => {
  "use strict";

  const LOG_PREFIX = "[YouTube Auto Skip]";

  // YouTube change régulièrement ses classes : on tolère plusieurs sélecteurs.
  // background.js revérifie la cible avec les mêmes règles : modifier les deux fichiers ensemble.
  const SKIP_SELECTORS = [
    ".ytp-skip-ad-button",
    ".ytp-ad-skip-button",
    ".ytp-ad-skip-button-modern",
    'button[id^="skip-button"]',
    'button[class*="skip-ad"]',
  ].join(",");

  // v2 : bouton « Ignorer l'enquête » des pubs à sondage. Pas de classe stable connue :
  // on cherche, dans les conteneurs de pub uniquement, un bouton dont le libellé correspond.
  const SURVEY_CONTAINERS = ".video-ads, .ytp-ad-module, .ytp-ad-survey, .ytp-ad-player-overlay";
  const SURVEY_BUTTONS = 'button, [role="button"]';
  const SURVEY_TEXT = /ignorer l['’]enqu[êe]te|skip survey/i;

  // Le clic est désormais un vrai clic souris : on ne cible que des boutons du lecteur vidéo.
  const PLAYER_SELECTOR = ".html5-video-player";

  // Évite une double injection si le script est évalué deux fois.
  if (window.__ytAutoSkipInstalled) return;
  window.__ytAutoSkipInstalled = true;

  /**
   * Vrai si l'élément est réellement affiché et cliquable :
   * - offsetParent non nul (donc pas display:none, ni détaché du DOM)
   * - visibility différent de "hidden"
   */
  function isVisible(el) {
    if (!el || el.offsetParent === null) return false;
    const style = getComputedStyle(el);
    return style.visibility !== "hidden";
  }

  /** Boutons « Ignorer l'enquête » : détectés par leur libellé (texte ou aria-label). */
  function findSurveyButtons() {
    const found = [];
    for (const container of document.querySelectorAll(SURVEY_CONTAINERS)) {
      for (const el of container.querySelectorAll(SURVEY_BUTTONS)) {
        const label = `${el.getAttribute("aria-label") || ""} ${el.textContent || ""}`;
        if (SURVEY_TEXT.test(label)) found.push(el);
      }
    }
    return found;
  }

  /**
   * YouTube ignore les clics générés par script (button.click(), dispatchEvent) : seuls les
   * clics « de confiance » (isTrusted) passent. On demande donc au service worker
   * (background.js) d'envoyer un vrai clic souris via l'API chrome.debugger,
   * aux coordonnées du centre du bouton dans la fenêtre.
   * Renvoie "trusted" (vrai clic envoyé), "fallback" (clic de secours button.click()),
   * "busy" (un clic est déjà en cours dans cet onglet) ou null (aucun clic).
   */
  async function pressButton(el) {
    const rect = el.getBoundingClientRect();
    // Coordonnées entières : les anciennes versions de Chrome refusent les décimales
    // dans les commandes du débogueur (« int32 value expected »).
    const x = Math.round(rect.left + rect.width / 2);
    const y = Math.round(rect.top + rect.height / 2);

    // Un vrai clic atterrit sur l'élément au premier plan à ces coordonnées : si le bouton
    // est recouvert (ex. carte « Acheter maintenant »), on ne clique pas, pour ne jamais
    // ouvrir le site de l'annonceur par erreur.
    const hit = document.elementFromPoint(x, y);
    if (!hit || !el.contains(hit)) {
      console.log(`${LOG_PREFIX} Bouton recouvert, clic annulé par sécurité`, { recouvert_par: hit });
      return null;
    }

    try {
      const response = await chrome.runtime.sendMessage({ type: "trusted-click", x, y });
      if (response && response.ok) return "trusted";
      // Un autre clic est en cours (ex. deux pubs d'affilée) : ce n'est pas une erreur,
      // l'appelant réessaiera dès que le verrou sera libéré.
      if (response && response.busy) return "busy";
      console.warn(`${LOG_PREFIX} Clic de confiance refusé :`, response && response.error);
    } catch (error) {
      if (!chrome.runtime || !chrome.runtime.id) {
        // L'extension a été rechargée ou retirée : ce script est orphelin, on l'arrête.
        // Recharger l'onglet réinjecte la nouvelle version.
        stop();
        return null;
      }
      console.warn(`${LOG_PREFIX} Impossible de contacter l'extension :`, error.message);
    }

    // Secours : un clic simple. Les versions récentes de YouTube l'ignorent, mais il ne
    // coûte rien et cible le bouton lui-même, jamais un élément qui le recouvrirait.
    el.click();
    return "fallback";
  }

  // Dernier clic par bouton : YouTube réutilise le même élément d'une pub à l'autre,
  // on évite donc de recliquer en boucle à chaque mutation pendant la transition.
  const lastClick = new WeakMap();
  const CLICK_COOLDOWN_MS = 1000;
  // Délai avant de réessayer quand le service worker répond « clic déjà en cours ».
  const BUSY_RETRY_MS = 300;

  /** Cherche les boutons « Ignorer » (pub et enquête) visibles et clique dessus. */
  function trySkip() {
    const buttons = new Set([...document.querySelectorAll(SKIP_SELECTORS), ...findSurveyButtons()]);
    for (const button of buttons) {
      if (!button.closest(PLAYER_SELECTOR)) continue;
      // Pas de condition sur l'opacité : YouTube grise le bouton (opacity 0.5) dès que la
      // souris n'est pas sur le lecteur, alors qu'il reste cliquable.
      if (!isVisible(button) || button.disabled) continue;
      const now = Date.now();
      if (now - (lastClick.get(button) || 0) < CLICK_COOLDOWN_MS) continue;
      lastClick.set(button, now);
      pressButton(button).then((outcome) => {
        if (outcome === "busy") {
          // On lève le délai anti-spam de ce bouton et on revérifie peu après, pour que la
          // seconde pub d'une série soit elle aussi ignorée.
          lastClick.delete(button);
          setTimeout(scheduleCheck, BUSY_RETRY_MS);
          return;
        }
        if (!outcome) return;
        const message = outcome === "trusted"
          ? "Publicité ou enquête ignorée"
          : "Clic de secours (button.click()) envoyé";
        console.log(`${LOG_PREFIX} ${message}`, {
          selector: button.className || button.id,
          url: location.href,
        });
      });
    }
  }

  // Throttle : au plus une vérification par frame, quel que soit le nombre de mutations.
  // Dans un onglet en arrière-plan, Chrome suspend requestAnimationFrame : on passe alors
  // par un setTimeout pour que les pubs soient aussi ignorées quand on écoute sans regarder.
  const HIDDEN_TAB_DELAY_MS = 250;
  let scheduled = false;
  function scheduleCheck() {
    if (scheduled) return;
    scheduled = true;
    const run = () => {
      scheduled = false;
      trySkip();
    };
    if (document.hidden) setTimeout(run, HIDDEN_TAB_DELAY_MS);
    else requestAnimationFrame(run);
  }

  // Le bouton apparaît dynamiquement (ajout de nœud, changement de classe/style) :
  // on observe tout le document, sans lire le contenu des mutations.
  const observer = new MutationObserver(scheduleCheck);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "style", "hidden"],
  });

  // Navigation SPA : YouTube ne recharge pas la page entre deux vidéos.
  // Le MutationObserver reste actif sur document.documentElement (jamais remplacé),
  // mais on force une vérification à chaque navigation interne signalée par YouTube.
  window.addEventListener("yt-navigate-finish", scheduleCheck);
  window.addEventListener("popstate", scheduleCheck);

  /** Arrête toute surveillance (script devenu orphelin après rechargement de l'extension). */
  function stop() {
    observer.disconnect();
    window.removeEventListener("yt-navigate-finish", scheduleCheck);
    window.removeEventListener("popstate", scheduleCheck);
  }

  // Vérification initiale (une pub peut déjà être affichée au chargement).
  scheduleCheck();
})();
