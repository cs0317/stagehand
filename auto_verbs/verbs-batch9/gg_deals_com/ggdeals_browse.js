const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = { maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://gg.deals/deals/`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(5000);

    const items = await page.evaluate((max) => {
      const results = [];
      const cards = document.querySelectorAll('[class*="deal-card"], [class*="game-deal"], [class*="deal-item"], article, [class*="list-item"]');
      for (const card of cards) {
        if (results.length >= max) break;
        const titleEl = card.querySelector('a[class*="title"], h3, h2, [class*="game-title"], [class*="name"]');
        const title = titleEl ? titleEl.textContent.trim() : '';
        if (!title || title.length < 3) continue;
        if (results.some(r => r.title === title)) continue;

        const text = (card.textContent || '').replace(/\s+/g, ' ').trim();

        let store = '';
        const storeEl = card.querySelector('[class*="shop"], [class*="store"], img[alt*="store"], img[alt]');
        if (storeEl) store = (storeEl.getAttribute('alt') || storeEl.textContent || '').trim();

        let currentPrice = '';
        const priceEl = card.querySelector('[class*="price-new"], [class*="current-price"], [class*="price"]');
        if (priceEl) currentPrice = priceEl.textContent.trim();

        let histLow = '';
        const lowMatch = text.match(/(?:historical|lowest|all.time)\s*(?:low)?:?\s*\$?[\d,.]+/i);
        if (lowMatch) histLow = lowMatch[0];

        let discount = '';
        const discEl = card.querySelector('[class*="discount"], [class*="badge"]');
        if (discEl) discount = discEl.textContent.trim();
        if (!discount) {
          const discMatch = text.match(/-?\d+%/);
          if (discMatch) discount = discMatch[0];
        }

        results.push({ title, store, current_price: currentPrice, historical_low: histLow, discount });
      }
      return results;
    }, CFG.maxResults);

    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
