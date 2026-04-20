const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = { searchQuery: "cybersecurity", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.gao.gov/search?keyword=${encodeURIComponent(CFG.searchQuery)}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(5000);

    const items = await page.evaluate((max) => {
      const results = [];
      const cards = document.querySelectorAll('[class*="search-result"], article, [class*="result"], [class*="views-row"], li[class*="item"]');
      for (const card of cards) {
        if (results.length >= max) break;
        const titleEl = card.querySelector('h2, h3, h4, a[class*="title"], [class*="report-title"]');
        const title = titleEl ? titleEl.textContent.trim() : '';
        if (!title || title.length < 10) continue;
        if (results.some(r => r.title === title)) continue;

        const text = (card.textContent || '').replace(/\s+/g, ' ').trim();

        let reportNumber = '';
        const numMatch = text.match(/(GAO-\d{2}-\d+[A-Z]*)/i);
        if (numMatch) reportNumber = numMatch[1];

        let publishDate = '';
        const dateEl = card.querySelector('time, [class*="date"], [datetime]');
        if (dateEl) publishDate = (dateEl.getAttribute('datetime') || dateEl.textContent || '').trim();
        if (!publishDate) {
          const dateMatch = text.match(/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{1,2},?\s+\d{4}/i);
          if (dateMatch) publishDate = dateMatch[0];
        }

        let summary = '';
        const descEl = card.querySelector('p, [class*="summary"], [class*="description"], [class*="snippet"]');
        if (descEl) summary = descEl.textContent.trim().substring(0, 200);

        results.push({ title, report_number: reportNumber, publish_date: publishDate, summary });
      }
      return results;
    }, CFG.maxResults);

    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
