const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = { searchQuery: "wireless headphones", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(CFG.searchQuery)}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(5000);

    const items = await page.evaluate((max) => {
      const results = [];
      const cards = document.querySelectorAll('[class*="sh-dgr__content"], [class*="sh-dlr__list-result"], [data-docid], [class*="product"]');
      for (const card of cards) {
        if (results.length >= max) break;

        const nameEl = card.querySelector('h3, h4, [class*="tAxDx"], a[class*="translate-content"]');
        const name = nameEl ? nameEl.textContent.trim() : '';
        if (!name || name.length < 5) continue;
        if (results.some(r => r.name === name)) continue;

        let price = '';
        const priceEl = card.querySelector('[class*="a8Pemb"], [class*="price"], b');
        if (priceEl) price = priceEl.textContent.trim();

        let store = '';
        const storeEl = card.querySelector('[class*="aULzUe"], [class*="merchant"], [class*="store"]');
        if (storeEl) store = storeEl.textContent.trim();

        let rating = '';
        const ratingEl = card.querySelector('[class*="Rsc7Yb"], [aria-label*="stars"], [class*="rating"]');
        if (ratingEl) {
          const ariaLabel = ratingEl.getAttribute('aria-label') || '';
          const rateMatch = ariaLabel.match(/([\d.]+)/);
          if (rateMatch) rating = rateMatch[1];
          if (!rating) rating = ratingEl.textContent.trim();
        }

        let reviews = '';
        const reviewEl = card.querySelector('[class*="qIEPib"], [class*="review"]');
        if (reviewEl) {
          const revMatch = reviewEl.textContent.match(/([\d,]+)/);
          if (revMatch) reviews = revMatch[1];
        }

        results.push({ name, price, store, rating, reviews });
      }
      return results;
    }, CFG.maxResults);

    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
