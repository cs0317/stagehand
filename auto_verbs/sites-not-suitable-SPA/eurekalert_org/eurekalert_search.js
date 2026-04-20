const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = { searchQuery: "Alzheimer's research", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.eurekalert.org/search?query=${encodeURIComponent(CFG.searchQuery)}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(5000);

    const items = await page.evaluate((max) => {
      const results = [];
      const cards = document.querySelectorAll('.search-result, article, [class*="result"], .card');
      for (const card of cards) {
        if (results.length >= max) break;
        const nameEl = card.querySelector('h2, h3, h4, [class*="title"], a');
        const name = nameEl ? nameEl.textContent.trim() : '';
        if (!name || name.length < 10) continue;
        if (results.some(r => r.name === name)) continue;

        let institution = '';
        const instEl = card.querySelector('[class*="source"], [class*="institution"], [class*="org"]');
        if (instEl) institution = instEl.textContent.trim();

        let date = '';
        const dateEl = card.querySelector('time, [class*="date"]');
        if (dateEl) date = dateEl.textContent.trim();

        let summary = '';
        const descEl = card.querySelector('p, [class*="summary"], [class*="desc"]');
        if (descEl) summary = descEl.textContent.trim().substring(0, 200);

        results.push({ name, institution, date, summary });
      }
      return results;
    }, CFG.maxResults);

    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
