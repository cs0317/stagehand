const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = { searchQuery: "email marketing", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://blog.hubspot.com/search?query=${encodeURIComponent(CFG.searchQuery)}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(5000);

    const items = await page.evaluate((max) => {
      const results = [];
      const cards = document.querySelectorAll('article, [class*="blog-post"], [class*="post-listing"], [class*="search-result"], [class*="card"]');
      for (const card of cards) {
        if (results.length >= max) break;
        const titleEl = card.querySelector('h2, h3, a[class*="title"], [class*="post-title"]');
        const title = titleEl ? titleEl.textContent.trim() : '';
        if (!title || title.length < 10) continue;
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

        let readTime = '';
        const text = (card.textContent || '').replace(/\s+/g, ' ');
        const readMatch = text.match(/(\d+)\s*min\s*read/i);
        if (readMatch) readTime = readMatch[1] + ' min read';

        results.push({ title, author, publish_date: publishDate, category, read_time: readTime });
      }
      return results;
    }, CFG.maxResults);

    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
