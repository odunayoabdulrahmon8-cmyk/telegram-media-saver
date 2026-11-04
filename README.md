# Telegram Media Saver

A small Chrome Manifest V3 extension for **Telegram Web A** (`https://web.telegram.org/a/`).

## What it does

- Checks the actual `video` and `audio` elements Telegram exposes in the page.
- Offers a normal Chrome download when a direct HTTP(S) media URL is exposed.
- Copies that direct URL so you can paste it into Neat Download Manager (NDM) using **Add URL**.
- Explains when Telegram exposes only a browser-managed `blob:` stream or no direct URL.

## What it does not do

This extension does **not** intercept hidden network traffic, reconstruct segmented streams, resolve protected media, copy Telegram session credentials, or bypass Telegram's content-protection / save restrictions. A playable recording is not necessarily a downloadable file.

A copied URL may be temporary, may require Telegram's authenticated browser session, or may be rejected by NDM. If that happens, this extension cannot make the stream downloadable.

## Install in Chrome (developer mode)

1. Download this repository as a ZIP and extract it.
2. Open `chrome://extensions`.
3. Turn on **Developer mode**.
4. Choose **Load unpacked**.
5. Select the extracted `telegram-media-saver` folder.
6. Open or refresh Telegram Web A at `https://web.telegram.org/a/`.
7. Open a recording and start playback. The helper panel appears at the bottom-right.

## Use with NDM

If **Copy URL for NDM** is enabled, click it, open NDM, choose **Add URL**, and paste the copied address. NDM may not be able to use URLs that are temporary or tied to the Telegram browser session.

## Troubleshooting

- **No direct URL detected:** Telegram may be using a `blob:` URL or a protected/segmented stream. The extension intentionally does not extract it.
- **Chrome download fails:** The URL may have expired, require a browser session that the download manager cannot access, or be non-downloadable.
- **No panel:** Confirm the extension is enabled and that the page is `web.telegram.org/a/`, then refresh the tab.

## Permissions

- `downloads`: starts a normal Chrome download after you click the button.
- `clipboardWrite`: copies a direct URL after you click the NDM button.
- `https://web.telegram.org/*`: runs the helper on Telegram Web.

## Development

No build step is required. Load the repository folder as an unpacked extension.
