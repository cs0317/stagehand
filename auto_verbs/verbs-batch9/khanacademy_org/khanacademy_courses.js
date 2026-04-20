const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = { domain: "computing", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    // Khan Academy computing/computer-science courses page
    const url = "https://www.khanacademy.org/computing";
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(5000);

    const items = await page.evaluate((max) => {
      const results = [];
      // Khan Academy lists courses as cards/links on domain pages
      const cards = document.querySelectorAll(
        'a[data-test-id="course-card"], ' +
        'a[href*="/computing/"] , ' +
        '[class*="course"] a, ' +
        'li a[href*="/computing/"], ' +
        '#tutorials-list a, ' +
        'a[data-slug]'
      );
      const seen = new Set();
      for (const card of cards) {
        if (results.length >= max) break;

        const titleEl = card.querySelector('h2, h3, h4, [class*="title"], span');
        let title = titleEl ? titleEl.textContent.trim() : card.textContent.trim();
        // Clean up: take first meaningful line
        title = title.split('\n')[0].trim();
        if (!title || title.length < 3 || seen.has(title)) continue;
        seen.add(title);

        let description = '';
        const descEl = card.querySelector('p, [class*="description"], [class*="desc"]');
        if (descEl) description = descEl.textContent.trim();

        let unitCount = '';
        const unitEl = card.querySelector('[class*="unit"], [class*="count"]');
        if (unitEl) unitCount = unitEl.textContent.trim();
        if (!unitCount) {
          const text = card.textContent || '';
          const unitMatch = text.match(/(\d+)\s*unit/i);
          if (unitMatch) unitCount = unitMatch[1] + ' units';
        }

        let estimatedTime = '';
        const timeMatch = (card.textContent || '').match(/(\d+)\s*(?:hour|hr|min)/i);
        if (timeMatch) estimatedTime = timeMatch[0];

        results.push({ title, unit_count: unitCount, estimated_time: estimatedTime, description });
      }
      return results;
    }, CFG.maxResults);

    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
