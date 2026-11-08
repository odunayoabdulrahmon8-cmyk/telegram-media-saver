# Client Room: setup in 4 steps

1. **Host the folder (free, needs HTTPS for the microphone).**
   Easiest: go to app.netlify.com/drop, sign in, and drag the whole `client-room-app` folder onto the page. You get a link like `https://something.netlify.app`.
   Alternatives: GitHub Pages or Cloudflare Pages.
2. **Open the link in Chrome on your phone.** Menu (three dots) > Add to Home screen / Install app.
3. **Get an Anthropic API key** at console.anthropic.com > API keys. Add a few dollars of credit and set a monthly spend limit.
4. **In the app:** Settings > paste the key > Save. Then Library > add your PDF and notes > Practice > Start call > tap the mic and speak.

Notes
- Your key, PDF text, calls and scores are stored only on the phone (browser storage). Clearing site data erases them.
- Allow the microphone when Chrome asks.
- Voice recognition is Chrome's built-in one and needs internet. It often removes "um" and "uh", so filler counts can be too low.
- Adding a PDF needs internet once (it loads the PDF reader). Scanned image PDFs have no text: paste the text instead.
- Anyone who can open the app on your phone can use your key, so keep the spend limit low.
