// YouTube Auto Skip — service worker
// Reçoit du content script les coordonnées du bouton « Ignorer » et envoie un vrai clic
// souris (événements « de confiance ») via chrome.debugger, seul moyen que YouTube accepte.

const YOUTUBE_ORIGINS = ["https://www.youtube.com", "https://m.youtube.com"];
const PROTOCOL_VERSION = "1.3";

// Onglets en cours de clic : évite d'attacher deux fois le débogueur en parallèle.
const busyTabs = new Set();

/** Attache le débogueur, envoie souris déplacée / appui / relâchement, puis détache. */
async function clickAt(tabId, x, y) {
  const target = { tabId };
  await chrome.debugger.attach(target, PROTOCOL_VERSION);
  try {
    const mouse = { x, y, button: "left", clickCount: 1 };
    await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
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
    sendResponse({ ok: false, error: "clic déjà en cours" });
    return;
  }

  busyTabs.add(tabId);
  clickAt(tabId, message.x, message.y)
    .then(() => sendResponse({ ok: true }))
    .catch((error) => sendResponse({ ok: false, error: String(error.message || error) }))
    .finally(() => busyTabs.delete(tabId));

  return true; // réponse asynchrone
});
