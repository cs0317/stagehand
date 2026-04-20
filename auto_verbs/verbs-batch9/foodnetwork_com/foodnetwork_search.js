const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = { searchQuery: "chocolate cake", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.foodnetwork.com/search/${encodeURIComponent(CFG.searchQuery).replace(/%20/g, '-')}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(5000);

    const items = await page.evaluate((max) => {
      const results = [];
      const cards = document.querySelectorAll('[class*="recipe"], article, [class*="card"], [class*="result-item"], li[class*="item"]');
      for (const card of cards) {
        if (results.length >= max) break;
        const titleEl = card.querySelector('h3, h2, a[class*="title"], [class*="recipe-title"]');
        const name = titleEl ? titleEl.textContent.trim() : '';
        if (!name || name.length < 5) continue;
        if (results.some(r => r.name === name)) continue;

        const text = (card.textContent || '').replace(/\s+/g, ' ').trim();

        let chef = '';
        const chefEl = card.querySelector('[class*="chef"], [class*="author"], [class*="show"], [class*="byline"]');
        if (chefEl) chef = chefEl.textContent.trim();

        let rating = '';
        const ratingMatch = text.match(/(\d\.?\d*)\s*(?:star|out of|\/\s*5)/i);
        if (ratingMatch) rating = ratingMatch[1];

        let reviews = '';
        const revMatch = text.match(/(\d[\d,]*)\s*(?:review|rating)/i);
        if (revMatch) reviews = revMatch[1];

        let prepTime = '';
        const timeMatch = text.match(/(?:prep|total|cook)\s*(?:time)?:?\s*(\d+\s*(?:hr|min|hour|minute)s?(?:\s*\d+\s*(?:min|minute)s?)?)/i);
        if (timeMatch) prepTime = timeMatch[1];

        let difficulty = '';
        const diffMatch = text.match(/(easy|medium|hard|intermediate|beginner|advanced)/i);
        if (diffMatch) difficulty = diffMatch[0];

        results.push({ name, chef, rating, reviews, prep_time: prepTime, difficulty });
      }
      return results;
    }, CFG.maxResults);

    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
