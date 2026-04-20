const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = { searchQuery: "acoustic guitars", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.guitarcenter.com/search?typeAheadSuggestion=false&fromRecentHistory=false&Ntt=${encodeURIComponent(CFG.searchQuery)}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(5000);

    const items = await page.evaluate((max) => {
      const results = [];
      const cards = document.querySelectorAll('[class*="product-card"], [class*="product-container"], [data-product-id], .product');
      for (const card of cards) {
        if (results.length >= max) break;

        const nameEl = card.querySelector('[class*="product-name"], h3, h2, a[class*="title"]');
        const name = nameEl ? nameEl.textContent.trim() : '';
        if (!name || name.length < 5) continue;
        if (results.some(r => r.name === name)) continue;

        let brand = '';
        const brandEl = card.querySelector('[class*="brand"], [class*="Brand"]');
        if (brandEl) brand = brandEl.textContent.trim();

        let price = '';
        const priceEl = card.querySelector('[class*="price"], [class*="sale-price"], [class*="productPrice"]');
        if (priceEl) price = priceEl.textContent.trim();

        let bodyType = '';
        const text = (card.textContent || '').replace(/\s+/g, ' ');
        const bodyMatch = text.match(/(dreadnought|concert|parlor|jumbo|grand auditorium|orchestra|cutaway|classical)/i);
        if (bodyMatch) bodyType = bodyMatch[1];

        let rating = '';
        const ratingEl = card.querySelector('[class*="rating"], [class*="star"], [aria-label*="star"]');
        if (ratingEl) {
          const ariaLabel = ratingEl.getAttribute('aria-label') || '';
          const rateMatch = ariaLabel.match(/([\d.]+)/);
          if (rateMatch) rating = rateMatch[1];
          if (!rating) rating = ratingEl.textContent.trim();
        }

        results.push({ name, brand, price, body_type: bodyType, rating });
      }
      return results;
    }, CFG.maxResults);

    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
