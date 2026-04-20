const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = { searchQuery: "acrylic paint", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.hobbylobby.com/search/?text=${encodeURIComponent(CFG.searchQuery)}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(5000);

    const items = await page.evaluate((max) => {
      const results = [];
      const cards = document.querySelectorAll('[class*="product"], [class*="card"], [data-product], article');
      for (const card of cards) {
        if (results.length >= max) break;
        const nameEl = card.querySelector('[class*="product-name"], h3, h2, a[class*="name"], [class*="title"]');
        const name = nameEl ? nameEl.textContent.trim() : '';
        if (!name || name.length < 5) continue;
        if (results.some(r => r.name === name)) continue;

        let brand = '';
        const brandEl = card.querySelector('[class*="brand"], [class*="Brand"]');
        if (brandEl) brand = brandEl.textContent.trim();

        let price = '';
        const priceEl = card.querySelector('[class*="price"], [class*="Price"]');
        if (priceEl) price = priceEl.textContent.trim();

        let availability = '';
        const availEl = card.querySelector('[class*="availability"], [class*="stock"], [class*="shipping"]');
        if (availEl) availability = availEl.textContent.trim();

        results.push({ name, brand, price, availability });
      }
      return results;
    }, CFG.maxResults);

    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
