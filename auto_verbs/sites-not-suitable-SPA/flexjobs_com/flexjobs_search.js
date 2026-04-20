const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = { searchQuery: "UX designer", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.flexjobs.com/search?search=${encodeURIComponent(CFG.searchQuery)}&tele_level%5B%5D=All+Telecommuting`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(5000);

    const items = await page.evaluate((max) => {
      const results = [];
      const cards = document.querySelectorAll('[class*="job-listing"], [class*="job-card"], article, li[class*="job"], [class*="search-result"]');
      for (const card of cards) {
        if (results.length >= max) break;
        const titleEl = card.querySelector('h2, h3, a[class*="title"], [class*="job-title"], [class*="job-name"]');
        const title = titleEl ? titleEl.textContent.trim() : '';
        if (!title || title.length < 5) continue;
        if (results.some(r => r.title === title)) continue;

        const text = (card.textContent || '').replace(/\s+/g, ' ').trim();

        let company = '';
        const compEl = card.querySelector('[class*="company"], [class*="employer"]');
        if (compEl) company = compEl.textContent.trim();

        let jobType = '';
        const jtMatch = text.match(/(full[- ]time|part[- ]time|contract|freelance|temporary)/i);
        if (jtMatch) jobType = jtMatch[0];

        let flexibility = '';
        const flexMatch = text.match(/(remote|hybrid|work from home|telecommute|100% remote)/i);
        if (flexMatch) flexibility = flexMatch[0];

        let location = '';
        const locEl = card.querySelector('[class*="location"], [class*="place"]');
        if (locEl) location = locEl.textContent.trim();

        results.push({ title, company, job_type: jobType, flexibility, location });
      }
      return results;
    }, CFG.maxResults);

    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
