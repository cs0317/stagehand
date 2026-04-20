const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = { searchQuery: "arthritis management", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.everydayhealth.com/search/?q=${encodeURIComponent(CFG.searchQuery)}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(5000);

    const items = await page.evaluate((max) => {
      const results = [];
      const cards = document.querySelectorAll('article, [class*="result"], [class*="card"], .search-result');
      for (const card of cards) {
        if (results.length >= max) break;
        const titleEl = card.querySelector('h2, h3, h4, a[class*="title"], [class*="headline"]');
        const title = titleEl ? titleEl.textContent.trim() : '';
        if (!title || title.length < 10) continue;
        if (results.some(r => r.title === title)) continue;

        const text = (card.textContent || '').replace(/\s+/g, ' ').trim();

        let author = '';
        const authorEl = card.querySelector('[class*="author"], [class*="byline"], [rel="author"]');
        if (authorEl) author = authorEl.textContent.trim().replace(/^by\s*/i, '');

        let reviewer = '';
        const revMatch = text.match(/(?:reviewed|medically reviewed)\s+by\s+([^,\n]+)/i);
        if (revMatch) reviewer = revMatch[1].trim();

        let date = '';
        const dateEl = card.querySelector('time, [class*="date"], [datetime]');
        if (dateEl) date = (dateEl.getAttribute('datetime') || dateEl.textContent || '').trim();

        let summary = '';
        const descEl = card.querySelector('p, [class*="description"], [class*="summary"], [class*="excerpt"]');
        if (descEl) summary = descEl.textContent.trim().substring(0, 200);

        results.push({ title, author, medical_reviewer: reviewer, publish_date: date, summary });
      }
      return results;
    }, CFG.maxResults);

    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
