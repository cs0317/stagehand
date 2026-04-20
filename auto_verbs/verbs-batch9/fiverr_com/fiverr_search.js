const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = { searchQuery: "logo design", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.fiverr.com/search/gigs?query=${encodeURIComponent(CFG.searchQuery)}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(5000);

    const items = await page.evaluate((max) => {
      const results = [];
      const cards = document.querySelectorAll('[class*="gig-card"], [class*="listing"], [class*="basic-gig"], article');
      for (const card of cards) {
        if (results.length >= max) break;
        const titleEl = card.querySelector('h3, [class*="title"], a[class*="gig-title"]');
        const title = titleEl ? titleEl.textContent.trim() : '';
        if (!title || title.length < 5) continue;
        if (results.some(r => r.title === title)) continue;

        const text = (card.textContent || '').replace(/\s+/g, ' ').trim();

        let seller = '';
        const sellerEl = card.querySelector('[class*="seller-name"], [class*="username"], a[class*="seller"]');
        if (sellerEl) seller = sellerEl.textContent.trim();

        let level = '';
        const levelEl = card.querySelector('[class*="level"], [class*="badge"]');
        if (levelEl) level = levelEl.textContent.trim();

        let price = '';
        const priceEl = card.querySelector('[class*="price"], [class*="starting"]');
        if (priceEl) price = priceEl.textContent.trim();
        if (!price) {
          const pMatch = text.match(/(?:from|starting)\s*\$[\d,.]+/i);
          if (pMatch) price = pMatch[0];
        }

        let rating = '';
        const ratingMatch = text.match(/(\d\.?\d*)\s*\(/);
        if (ratingMatch) rating = ratingMatch[1];

        let reviews = '';
        const revMatch = text.match(/\((\d[\d,]*k?)\)/i);
        if (revMatch) reviews = revMatch[1];

        results.push({ title, seller, level, price, rating, reviews });
      }
      return results;
    }, CFG.maxResults);

    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
