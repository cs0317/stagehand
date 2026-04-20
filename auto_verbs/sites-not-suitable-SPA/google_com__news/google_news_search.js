const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = { searchQuery: "artificial intelligence", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://news.google.com/search?q=${encodeURIComponent(CFG.searchQuery)}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(5000);

    const items = await page.evaluate((max) => {
      const results = [];
      const articles = document.querySelectorAll('article, [class*="NiLAwe"], [class*="IBr9hb"], c-wiz article, [jscontroller] article');
      for (const art of articles) {
        if (results.length >= max) break;

        const headlineEl = art.querySelector('a[class*="JtKRv"], h3 a, h4 a, a[href*="./articles/"]');
        const headline = headlineEl ? headlineEl.textContent.trim() : '';
        if (!headline || headline.length < 5) continue;
        if (results.some(r => r.headline === headline)) continue;

        let source = '';
        const sourceEl = art.querySelector('[class*="vr1PYe"], [data-n-tid], [class*="source"], time + span, div[class*="SVJrMe"]');
        if (sourceEl) source = sourceEl.textContent.trim();

        let time = '';
        const timeEl = art.querySelector('time, [class*="WW6dff"], [datetime]');
        if (timeEl) time = timeEl.textContent.trim() || timeEl.getAttribute('datetime') || '';

        let snippet = '';
        const snippetEl = art.querySelector('[class*="xBbh9"], [class*="snippet"], p');
        if (snippetEl) snippet = snippetEl.textContent.trim().substring(0, 200);

        results.push({ headline, source, time, snippet });
      }
      return results;
    }, CFG.maxResults);

    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
