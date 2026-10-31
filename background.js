// YouTube Auto Skip — service worker
// Reçoit du content script les coordonnées du bouton « Ignorer » et envoie un vrai clic
// souris (événements « de confiance ») via chrome.debugger, seul moyen que YouTube accepte.

const YOUTUBE_ORIGINS = ["https://www.youtube.com", "https://m.youtube.com"];
const PROTOCOL_VERSION = "1.3";

// Ce qu'on accepte de cliquer. À garder synchronisé avec content.js.
const SKIP_SELECTORS = [
  ".ytp-skip-ad-button",
  ".ytp-ad-skip-button",
  ".ytp-ad-skip-button-modern",
  'button[id^="skip-button"]',
  'button[class*="skip-ad"]',
].join(",");
const SURVEY_CONTAINERS = ".video-ads, .ytp-ad-module, .ytp-ad-survey, .ytp-ad-player-overlay";
const SURVEY_BUTTONS = 'button, [role="button"]';
const SURVEY_TEXT = "ignorer l['’]enqu[êe]te|skip survey";
const PLAYER_SELECTOR = ".html5-video-player";

/**
 * Exécutée dans la page, sur l'élément situé sous le point de clic (this).
 * Vrai si cet élément est un bouton « Ignorer » ou « Ignorer l'enquête » du lecteur, ou
 * l'un de ses enfants (texte, icône).
 */
function isSkipTarget(skipSel, surveyContainers, surveyButtons, surveyText, playerSel) {
  const el = this.nodeType === 1 ? this : this.parentElement;
  if (!el || !el.closest(playerSel)) return false;
  if (el.closest(skipSel)) return true;
  const button = el.closest(surveyButtons);
  if (!button || !button.closest(surveyContainers)) return false;
  const label = `${button.getAttribute("aria-label") || ""} ${button.textContent || ""}`;
  return new RegExp(surveyText, "i").test(label);
}

// Onglets en cours de clic : évite d'attacher deux fois le débogueur en parallèle.
const busyTabs = new Set();

/**
 * Vérifie, côté navigateur, que l'élément au premier plan en (x, y) est bien un bouton
 * « Ignorer ». On ne fait donc pas confiance aux coordonnées reçues : même si elles étaient
 * fausses ou périmées (mise en page qui a bougé), le clic n'atterrit jamais ailleurs.
 * Le test tourne dans un « monde isolé » : le JavaScript de la page ne peut pas le fausser
 * (en redéfinissant Element.prototype.closest, par exemple).
 */
async function isSkipButtonAt(target, x, y) {
  const send = (method, params) => chrome.debugger.sendCommand(target, method, params);

  const { frameTree } = await send("Page.getFrameTree");
  const { executionContextId } = await send("Page.createIsolatedWorld", {
    frameId: frameTree.frame.id,
    worldName: "youtube-auto-skip-check",
  });
  await send("DOM.getDocument", { depth: 0 });
  const { backendNodeId } = await send("DOM.getNodeForLocation", { x: Math.round(x), y: Math.round(y) });
  const { object } = await send("DOM.resolveNode", { backendNodeId, executionContextId });
  const { result } = await send("Runtime.callFunctionOn", {
    objectId: object.objectId,
    functionDeclaration: isSkipTarget.toString(),
    arguments: [SKIP_SELECTORS, SURVEY_CONTAINERS, SURVEY_BUTTONS, SURVEY_TEXT, PLAYER_SELECTOR].map(
      (value) => ({ value })
    ),
    returnByValue: true,
  });
  return result.value === true;
}

/**
 * Attache le débogueur, survole le point, vérifie la cible, puis appui / relâchement, et détache.
 * Lève une erreur si la cible n'est pas un bouton « Ignorer ».
 */
async function clickAt(tabId, rawX, rawY) {
  const target = { tabId };
  // Coordonnées entières : les anciennes versions de Chrome refusent les décimales
  // (« Failed to deserialize params.x - int32 value expected »). Toutes les commandes
  // ci-dessous, y compris DOM.getNodeForLocation, utilisent ces valeurs arrondies.
  const x = Math.round(rawX);
  const y = Math.round(rawY);
  await chrome.debugger.attach(target, PROTOCOL_VERSION);
  try {
    const mouse = { x, y, button: "left", clickCount: 1 };
    // Le survol fait réapparaître les contrôles du lecteur : on vérifie la cible après,
    // dans l'état exact où le clic va avoir lieu.
    await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    if (!(await isSkipButtonAt(target, x, y))) {
      throw new Error("l'élément sous le point de clic n'est pas un bouton « Ignorer »");
    }
    await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", { ...mouse, type: "mousePressed", buttons: 1 });
    await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", { ...mouse, type: "mouseReleased", buttons: 0 });
  } finally {
    // Détacher fait disparaître la bannière « débogage de ce navigateur ».
    await chrome.debugger.detach(target).catch(() => {});
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "trusted-click") return;

  const tabId = sender.tab && sender.tab.id;
  // Seuls nos content scripts sur YouTube, dans le cadre principal, peuvent demander un clic.
  if (tabId === undefined || sender.frameId !== 0 || !YOUTUBE_ORIGINS.includes(sender.origin)) {
    sendResponse({ ok: false, error: "expéditeur non autorisé" });
    return;
  }
  if (!Number.isFinite(message.x) || !Number.isFinite(message.y)) {
    sendResponse({ ok: false, error: "coordonnées invalides" });
    return;
  }
  if (busyTabs.has(tabId)) {
    // Pas une erreur : le content script réessaiera une fois ce clic terminé.
    sendResponse({ ok: false, busy: true });
    return;
  }

  busyTabs.add(tabId);
  (async () => {
    try {
      await clickAt(tabId, message.x, message.y);
      sendResponse({ ok: true });
    } catch (error) {
      // Débogueur impossible à attacher, commande refusée, cible incorrecte…
      sendResponse({ ok: false, error: String((error && error.message) || error) });
    } finally {
      // Toujours libérer le verrou, même en cas d'échec ou si l'onglet a disparu
      // (sendResponse peut alors lever une erreur) : la pub suivante doit pouvoir être ignorée.
      busyTabs.delete(tabId);
    }
  })().catch(() => {}); // onglet fermé : la réponse ne peut plus être envoyée, rien à faire

  return true; // réponse asynchrone
});
