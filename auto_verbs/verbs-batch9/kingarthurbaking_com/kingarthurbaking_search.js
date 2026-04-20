const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = { searchQuery: "sourdough bread", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.kingarthurbaking.com/recipes?query=${encodeURIComponent(CFG.searchQuery)}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(5000);

    const items = await page.evaluate((max) => {
      const results = [];
      const cards = document.querySelectorAll(
        '.search-results__item, .recipe-card, article, [class*="recipe"], .views-row, .search-result'
      );
      const seen = new Set();
      for (const card of cards) {
        if (results.length >= max) break;

        const titleEl = card.querySelector('h2 a, h3 a, h2, h3, [class*="title"] a, [class*="title"]');
        const title = titleEl ? titleEl.textContent.trim() : '';
        if (!title || title.length < 3 || seen.has(title)) continue;
        seen.add(title);

        let rating = '';
        const ratingEl = card.querySelector('[class*="rating"], [class*="star"], [aria-label*="star"], [aria-label*="rating"]');
        if (ratingEl) {
          rating = ratingEl.getAttribute('aria-label') || ratingEl.textContent.trim();
        }

        let reviews = '';
        const reviewEl = card.querySelector('[class*="review"], [class*="count"]');
        if (reviewEl) {
          const m = reviewEl.textContent.match(/(\d+)/);
          if (m) reviews = m[1];
        }

        let prepTime = '', bakeTime = '', difficulty = '';
        const text = card.textContent.replace(/\s+/g, ' ');
        const prepMatch = text.match(/prep[:\s]*(\d+\s*(?:min|hr|hour|minutes|hours))/i);
        if (prepMatch) prepTime = prepMatch[1];
        const bakeMatch = text.match(/bake[:\s]*(\d+\s*(?:min|hr|hour|minutes|hours))/i);
        if (bakeMatch) bakeTime = bakeMatch[1];
        const diffMatch = text.match(/(easy|medium|intermediate|advanced|hard|beginner)/i);
        if (diffMatch) difficulty = diffMatch[1];

        results.push({ title, rating, reviews, prep_time: prepTime, bake_time: bakeTime, difficulty });
      }
      return results;
    }, CFG.maxResults);

    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
