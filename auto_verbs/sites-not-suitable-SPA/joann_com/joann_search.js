const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = { searchQuery: "quilting fabric", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.joann.com/search?q=${encodeURIComponent(CFG.searchQuery)}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(5000);

    const items = await page.evaluate((max) => {
      const results = [];
      const cards = document.querySelectorAll('[class*="product-tile"], [class*="product-card"], [data-product-id], article');
      for (const card of cards) {
        if (results.length >= max) break;
        const nameEl = card.querySelector('[class*="product-name"], h3, h2, a[class*="name"], [class*="title"]');
        const name = nameEl ? nameEl.textContent.trim() : '';
        if (!name || name.length < 5) continue;
        if (results.some(r => r.name === name)) continue;

        let price = '';
        const priceEl = card.querySelector('[class*="price"], [class*="Price"]');
        if (priceEl) price = priceEl.textContent.trim();

        const text = (card.textContent || '').replace(/\s+/g, ' ');

        let pricePerYard = '';
        const yardMatch = text.match(/\$[\d.]+\s*(?:\/\s*yd|per\s*yard)/i);
        if (yardMatch) pricePerYard = yardMatch[0];

        let material = '';
        const matMatch = text.match(/(cotton|polyester|linen|silk|flannel|muslin|broadcloth)/i);
        if (matMatch) material = matMatch[1];

        let rating = '';
        const ratingEl = card.querySelector('[class*="rating"], [class*="star"], [aria-label*="star"]');
        if (ratingEl) {
          const ariaLabel = ratingEl.getAttribute('aria-label') || '';
          const rateMatch = ariaLabel.match(/([\d.]+)/);
          if (rateMatch) rating = rateMatch[1];
          if (!rating) rating = ratingEl.textContent.trim();
        }

        results.push({ name, price, price_per_yard: pricePerYard, material, rating });
      }
      return results;
    }, CFG.maxResults);

    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
