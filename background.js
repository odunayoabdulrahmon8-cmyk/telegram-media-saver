"use strict";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "TMS_DOWNLOAD") return;

  const url = message.url;
  if (typeof url !== "string") {
    sendResponse({ ok: false, error: "No media URL was supplied." });
    return;
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    sendResponse({ ok: false, error: "The media URL is invalid." });
    return;
  }

  // Only download a normal, directly exposed HTTP(S) media URL.
  // Do not resolve blob URLs, playlists, or segmented streaming manifests.
  if (!["https:", "http:"].includes(parsed.protocol) ||
      /\.(m3u8?|mpd)(?:$|[?#])/i.test(parsed.pathname + parsed.search)) {
    sendResponse({ ok: false, error: "This is not a direct downloadable media URL." });
    return;
  }

  chrome.downloads.download({ url, saveAs: true }, (downloadId) => {
    if (chrome.runtime.lastError) {
      sendResponse({ ok: false, error: chrome.runtime.lastError.message });
      return;
    }
    sendResponse({ ok: true, downloadId });
  });
  return true;
});
