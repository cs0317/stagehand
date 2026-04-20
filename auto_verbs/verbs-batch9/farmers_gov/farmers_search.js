const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = { searchQuery: "crop insurance", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.farmers.gov/search?query=${encodeURIComponent(CFG.searchQuery)}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(5000);

    const items = await page.evaluate((max) => {
      const results = [];
      const cards = document.querySelectorAll('.search-result, article, [class*="result"], [class*="views-row"], li[class*="item"]');
      for (const card of cards) {
        if (results.length >= max) break;
        const titleEl = card.querySelector('h2, h3, h4, a[class*="title"], [class*="field-title"]');
        const title = titleEl ? titleEl.textContent.trim() : '';
        if (!title || title.length < 5) continue;
        if (results.some(r => r.title === title)) continue;

        let category = '';
        const catEl = card.querySelector('[class*="type"], [class*="category"], [class*="tag"], span[class*="label"]');
        if (catEl) category = catEl.textContent.trim();

        let description = '';
        const descEl = card.querySelector('p, [class*="description"], [class*="summary"], [class*="snippet"]');
        if (descEl) description = descEl.textContent.trim().substring(0, 200);

        let link = '';
        const linkEl = card.querySelector('a[href]');
        if (linkEl) {
          link = linkEl.href || linkEl.getAttribute('href') || '';
          if (link.startsWith('/')) link = 'https://www.farmers.gov' + link;
        }

        results.push({ title, category, description, link });
      }
      return results;
    }, CFG.maxResults);

    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
