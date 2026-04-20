const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = { searchQuery: "World War II", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.history.com/search?q=${encodeURIComponent(CFG.searchQuery)}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(5000);

    const items = await page.evaluate((max) => {
      const results = [];
      const cards = document.querySelectorAll('article, [class*="search-result"], [class*="card"], [class*="article-item"], [class*="result"]');
      for (const card of cards) {
        if (results.length >= max) break;

        const titleEl = card.querySelector('h2, h3, a[class*="title"], [class*="headline"]');
        const title = titleEl ? titleEl.textContent.trim() : '';
        if (!title || title.length < 5) continue;
        if (results.some(r => r.title === title)) continue;

        let author = '';
        const authorEl = card.querySelector('[class*="author"], [class*="byline"]');
        if (authorEl) author = authorEl.textContent.trim().replace(/^by\s*/i, '');

        let publishDate = '';
        const dateEl = card.querySelector('time, [class*="date"], [datetime]');
        if (dateEl) publishDate = dateEl.textContent.trim() || dateEl.getAttribute('datetime') || '';

        let category = '';
        const catEl = card.querySelector('[class*="category"], [class*="topic"], [class*="tag"]');
        if (catEl) category = catEl.textContent.trim();

        let summary = '';
        const sumEl = card.querySelector('p, [class*="description"], [class*="excerpt"], [class*="summary"]');
        if (sumEl) summary = sumEl.textContent.trim().substring(0, 200);

        results.push({ title, author, publish_date: publishDate, category, summary });
      }
      return results;
    }, CFG.maxResults);

    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
