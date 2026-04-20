const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = { searchQuery: "handmade jewelry", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.etsy.com/search?q=${encodeURIComponent(CFG.searchQuery)}&ref=search_bar&search_type=shops`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(5000);

    const items = await page.evaluate((max) => {
      const results = [];
      const cards = document.querySelectorAll('[data-search-results] .v2-listing-card, .shop-card, [class*="ShopCard"], [class*="shop-listing"]');
      for (const card of cards) {
        if (results.length >= max) break;
        const text = (card.textContent || '').replace(/\s+/g, ' ').trim();
        const nameEl = card.querySelector('[class*="shop-name"], h3, h2, [class*="title"]');
        const name = nameEl ? nameEl.textContent.trim() : '';
        if (!name || name.length < 2) continue;
        if (results.some(r => r.name === name)) continue;

        let location = '';
        const locEl = card.querySelector('[class*="location"], [class*="address"]');
        if (locEl) location = locEl.textContent.trim();

        let rating = '';
        const ratingMatch = text.match(/(\d\.?\d*)\s*(?:stars?|out of)/i);
        if (ratingMatch) rating = ratingMatch[1];

        let sales = '';
        const salesMatch = text.match(/([\d,]+)\s*sales/i);
        if (salesMatch) sales = salesMatch[1];

        let desc = '';
        const descEl = card.querySelector('[class*="description"], p');
        if (descEl) desc = descEl.textContent.trim().substring(0, 200);

        results.push({ name, location, rating, sales, description: desc });
      }
      return results;
    }, CFG.maxResults);

    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
