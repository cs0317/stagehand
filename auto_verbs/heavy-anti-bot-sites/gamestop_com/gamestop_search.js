const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = { searchQuery: "PlayStation 5", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.gamestop.com/search/?q=${encodeURIComponent(CFG.searchQuery)}&lang=default`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(5000);

    const items = await page.evaluate((max) => {
      const results = [];
      const cards = document.querySelectorAll('[class*="product-card"], [class*="product-tile"], article, [data-testid*="product"]');
      for (const card of cards) {
        if (results.length >= max) break;
        const titleEl = card.querySelector('h2, h3, a[class*="title"], [class*="product-name"], [class*="title"]');
        const title = titleEl ? titleEl.textContent.trim() : '';
        if (!title || title.length < 5) continue;
        if (results.some(r => r.title === title)) continue;

        const text = (card.textContent || '').replace(/\s+/g, ' ').trim();

        let platform = '';
        const platMatch = text.match(/(PlayStation\s*[45]|PS[45]|Xbox|Nintendo\s*Switch|PC)/i);
        if (platMatch) platform = platMatch[0];

        let price = '';
        const priceEl = card.querySelector('[class*="price"]');
        if (priceEl) price = priceEl.textContent.trim();
        if (!price) {
          const pMatch = text.match(/\$[\d,.]+/);
          if (pMatch) price = pMatch[0];
        }

        let condition = '';
        const condMatch = text.match(/(new|pre-owned|used|refurbished|digital)/i);
        if (condMatch) condition = condMatch[0];

        let rating = '';
        const ratingMatch = text.match(/(\d\.?\d*)\s*(?:out of|\/\s*5|star)/i);
        if (ratingMatch) rating = ratingMatch[1];

        results.push({ title, platform, price, condition, rating });
      }
      return results;
    }, CFG.maxResults);

    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
