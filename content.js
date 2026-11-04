"use strict";

(() => {
  if (window.__telegramMediaSaverLoaded) return;
  window.__telegramMediaSaverLoaded = true;

  let panel;
  let currentMediaUrl = "";
  let currentLabel = "";

  function isDirectHttpMedia(value) {
    if (!value || typeof value !== "string") return false;
    try {
      const url = new URL(value, location.href);
      if (!["https:", "http:"].includes(url.protocol)) return false;
      if (url.origin === location.origin && url.pathname === "/") return false;
      if (/\.(m3u8?|mpd)(?:$|[?#])/i.test(url.pathname + url.search)) return false;
      return true;
    } catch {
      return false;
    }
  }

  function ensurePanel() {
    if (panel?.isConnected) return panel;
    panel = document.createElement("section");
    panel.id = "tms-panel";
    panel.setAttribute("aria-live", "polite");
    panel.innerHTML = `
      <div class="tms-heading">
        <strong>Telegram Media Saver</strong>
        <button class="tms-close" type="button" aria-label="Close">×</button>
      </div>
      <div class="tms-status">Looking for a directly exposed media file…</div>
      <div class="tms-actions">
        <button class="tms-download" type="button" disabled>Download</button>
        <button class="tms-copy" type="button" disabled>Copy URL for NDM</button>
      </div>
      <p class="tms-note">Only ordinary direct media URLs are supported. Protected or segmented streams are not extracted.</p>
    `;
    document.documentElement.appendChild(panel);
    panel.querySelector(".tms-close").addEventListener("click", () => panel.remove());
    panel.querySelector(".tms-download").addEventListener("click", downloadCurrent);
    panel.querySelector(".tms-copy").addEventListener("click", copyCurrent);
    return panel;
  }

  function setStatus(text, available) {
    const root = ensurePanel();
    root.querySelector(".tms-status").textContent = text;
    root.querySelector(".tms-download").disabled = !available;
    root.querySelector(".tms-copy").disabled = !available;
  }

  function mediaName(element) {
    const title = element.getAttribute("aria-label") ||
      element.getAttribute("title") ||
      element.closest("[data-testid]")?.getAttribute("data-testid");
    return title || (element.tagName.toLowerCase() === "audio" ? "Telegram audio" : "Telegram video");
  }

  function inspectMedia() {
    const media = [...document.querySelectorAll("video, audio")];
    let foundDirect = null;
    let sawBlob = false;

    for (const element of media) {
      const source = element.currentSrc || element.src ||
        element.querySelector("source[src]")?.src || "";
      if (isDirectHttpMedia(source)) {
        foundDirect = { url: source, label: mediaName(element) };
        break;
      }
      if (source.startsWith("blob:")) sawBlob = true;
    }

    if (foundDirect) {
      currentMediaUrl = foundDirect.url;
      currentLabel = foundDirect.label;
      setStatus(`Direct media URL detected: ${currentLabel}`, true);
    } else {
      currentMediaUrl = "";
      currentLabel = "";
      setStatus(
        sawBlob
          ? "Telegram is playing a browser-managed blob stream. No direct download URL is exposed to this extension."
          : "No directly downloadable media URL is exposed on this page yet. Start playback, then check again.",
        false
      );
    }
  }

  function downloadCurrent() {
    if (!currentMediaUrl) return;
    chrome.runtime.sendMessage({ type: "TMS_DOWNLOAD", url: currentMediaUrl }, (response) => {
      if (chrome.runtime.lastError) {
        setStatus("Download request failed: " + chrome.runtime.lastError.message, true);
        return;
      }
      if (!response?.ok) {
        setStatus(response?.error || "The browser could not start the download.", true);
        return;
      }
      setStatus("Download handed to Chrome. If Telegram requires a protected session, the download may still be rejected.", true);
    });
  }

  async function copyCurrent() {
    if (!currentMediaUrl) return;
    try {
      await navigator.clipboard.writeText(currentMediaUrl);
      setStatus("URL copied. Paste it into NDM using Add URL.", true);
    } catch {
      setStatus("Clipboard access was blocked. Try copying the URL from the page's media controls instead.", true);
    }
  }

  // Telegram is a single-page app; observe DOM changes and media source changes.
  const observer = new MutationObserver(() => inspectMedia());
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["src"] });
  document.addEventListener("play", inspectMedia, true);
  document.addEventListener("loadedmetadata", inspectMedia, true);
  ensurePanel();
  inspectMedia();
  window.setInterval(inspectMedia, 2500);
})();
