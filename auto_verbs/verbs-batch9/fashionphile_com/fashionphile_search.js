const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = { searchQuery: "Louis Vuitton", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.fashionphile.com/shop?search=${encodeURIComponent(CFG.searchQuery)}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(5000);

    const items = await page.evaluate((max) => {
      const results = [];
      const cards = document.querySelectorAll('[class*="product"], [class*="listing"], article, [data-testid*="product"]');
      for (const card of cards) {
        if (results.length >= max) break;
        const titleEl = card.querySelector('h2, h3, h4, a[class*="title"], [class*="product-name"], [class*="name"]');
        const name = titleEl ? titleEl.textContent.trim() : '';
        if (!name || name.length < 5) continue;
        if (results.some(r => r.name === name)) continue;

        const text = (card.textContent || '').replace(/\s+/g, ' ').trim();

        let condition = '';
        const condEl = card.querySelector('[class*="condition"], [class*="quality"]');
        if (condEl) condition = condEl.textContent.trim();
        if (!condition) {
          const condMatch = text.match(/((?:very )?good|excellent|fair|new|gently used|pre-owned)/i);
          if (condMatch) condition = condMatch[0];
        }

        let price = '';
        const priceEl = card.querySelector('[class*="price"]:not([class*="retail"]):not([class*="original"])');
        if (priceEl) price = priceEl.textContent.trim();
        if (!price) {
          const pMatch = text.match(/\$[\d,]+\.?\d*/);
          if (pMatch) price = pMatch[0];
        }

        let retailPrice = '';
        const retailEl = card.querySelector('[class*="retail"], [class*="original"], [class*="msrp"], s, del');
        if (retailEl) retailPrice = retailEl.textContent.trim();

        let savings = '';
        const savMatch = text.match(/(?:save|savings?)\s*\$?[\d,.]+%?/i);
        if (savMatch) savings = savMatch[0];

        results.push({ name, condition, price, retail_price: retailPrice, savings });
      }
      return results;
    }, CFG.maxResults);

    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
