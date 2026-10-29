// YouTube Auto Skip — content script
// Détecte le bouton « Ignorer » des publicités et clique dessus dès qu'il est visible.

(() => {
  "use strict";

  const LOG_PREFIX = "[YouTube Auto Skip]";

  // YouTube change régulièrement ses classes : on tolère plusieurs sélecteurs.
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
    return getComputedStyle(el).visibility !== "hidden";
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

  /** Cherche les boutons « Ignorer » (pub et enquête) visibles et clique dessus. */
  function trySkip() {
    const buttons = new Set([...document.querySelectorAll(SKIP_SELECTORS), ...findSurveyButtons()]);
    for (const button of buttons) {
      if (!isVisible(button) || button.disabled) continue;
      button.click();
      console.log(`${LOG_PREFIX} Publicité ou enquête ignorée`, {
        selector: button.className || button.id,
        url: location.href,
      });
    }
  }

  // Throttle : au plus une vérification par frame, quel que soit le nombre de mutations.
  let scheduled = false;
  function scheduleCheck() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      trySkip();
    });
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

  // Vérification initiale (une pub peut déjà être affichée au chargement).
  scheduleCheck();
})();
