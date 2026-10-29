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

  /** Cherche les boutons « Ignorer » visibles et clique dessus. */
  function trySkip() {
    const buttons = document.querySelectorAll(SKIP_SELECTORS);
    for (const button of buttons) {
      if (!isVisible(button) || button.disabled) continue;
      button.click();
      console.log(`${LOG_PREFIX} Publicité ignorée`, {
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
