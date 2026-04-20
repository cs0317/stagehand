const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = { searchQuery: "Toyota Camry", maxPrice: 20000, maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.ebay.com/sch/Cars-Trucks/6001/i.html?_nkw=${encodeURIComponent(CFG.searchQuery)}&_udhi=${CFG.maxPrice}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(5000);

    const items = await page.evaluate((max) => {
      const results = [];
      const cards = document.querySelectorAll('.s-item, [class*="s-item"]');
      for (const card of cards) {
        if (results.length >= max) break;
        const titleEl = card.querySelector('.s-item__title, [class*="title"] span');
        let title = titleEl ? titleEl.textContent.trim() : '';
        if (!title || title === 'Shop on eBay' || title.length < 5) continue;
        if (results.some(r => r.title === title)) continue;

        const priceEl = card.querySelector('.s-item__price, [class*="price"]');
        const price = priceEl ? priceEl.textContent.trim() : '';

        const text = (card.textContent || '').replace(/\s+/g, ' ').trim();
        let mileage = '';
        const miMatch = text.match(/([\d,]+)\s*(?:mi|miles|km)/i);
        if (miMatch) mileage = miMatch[1] + ' mi';

        let year = '';
        const yrMatch = title.match(/((?:19|20)\d{2})/);
        if (yrMatch) year = yrMatch[1];

        let location = '';
        const locEl = card.querySelector('.s-item__location, [class*="location"]');
        if (locEl) location = locEl.textContent.trim();

        let listingType = '';
        const typeEl = card.querySelector('.s-item__purchaseOptions, [class*="format"], [class*="listing-type"]');
        if (typeEl) listingType = typeEl.textContent.trim();

        results.push({ title, price, mileage, year, location, listing_type: listingType });
      }
      return results;
    }, CFG.maxResults);

    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
