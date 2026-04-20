const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = { searchQuery: "microservices architecture", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.infoq.com/search.action?queryString=${encodeURIComponent(CFG.searchQuery)}&page=1&searchOrder=relevance`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(5000);

    const items = await page.evaluate((max) => {
      const results = [];
      const cards = document.querySelectorAll('[class*="searchResult"], article, .news_type_block, [class*="card"]');
      for (const card of cards) {
        if (results.length >= max) break;
        const titleEl = card.querySelector('h3 a, h2 a, a[class*="title"], [class*="title"]');
        const title = titleEl ? titleEl.textContent.trim() : '';
        if (!title || title.length < 10) continue;
        if (results.some(r => r.title === title)) continue;

        let author = '';
        const authorEl = card.querySelector('[class*="author"], [class*="byline"]');
        if (authorEl) author = authorEl.textContent.trim().replace(/^by\s*/i, '');

        let publishDate = '';
        const dateEl = card.querySelector('[class*="date"], time, [datetime]');
        if (dateEl) publishDate = dateEl.textContent.trim() || dateEl.getAttribute('datetime') || '';

        let topic = '';
        const topicEl = card.querySelector('[class*="topic"], [class*="category"], [class*="tag"]');
        if (topicEl) topic = topicEl.textContent.trim();

        let summary = '';
        const sumEl = card.querySelector('p, [class*="description"], [class*="summary"]');
        if (sumEl) summary = sumEl.textContent.trim().substring(0, 200);

        results.push({ title, author, publish_date: publishDate, topic, summary });
      }
      return results;
    }, CFG.maxResults);

    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
