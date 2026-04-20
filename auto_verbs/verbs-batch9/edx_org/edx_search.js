const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = { searchQuery: "data science", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.edx.org/search?q=${encodeURIComponent(CFG.searchQuery)}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(5000);

    const items = await page.evaluate((max) => {
      const results = [];
      const cards = document.querySelectorAll('[class*="card"], [class*="discovery-card"], [data-testid*="card"]');
      for (const card of cards) {
        if (results.length >= max) break;
        const text = (card.textContent || '').replace(/\s+/g, ' ').trim();
        const nameEl = card.querySelector('h3, h4, [class*="title"]');
        const name = nameEl ? nameEl.textContent.trim() : '';
        if (!name || name.length < 5) continue;
        if (results.some(r => r.name === name)) continue;

        let institution = '';
        const instEl = card.querySelector('[class*="partner"], [class*="institution"], [class*="org"]');
        if (instEl) institution = instEl.textContent.trim();

        let level = '';
        const lvlMatch = text.match(/(introductory|intermediate|advanced|beginner)/i);
        if (lvlMatch) level = lvlMatch[1];

        let duration = '';
        const durMatch = text.match(/(\d+\s*(?:week|month|hour|day)s?)/i);
        if (durMatch) duration = durMatch[0];

        let pricing = '';
        const priceMatch = text.match(/(free|paid|\$[\d,.]+|audit)/i);
        if (priceMatch) pricing = priceMatch[0];

        results.push({ name, institution, level, duration, pricing });
      }
      return results;
    }, CFG.maxResults);

    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
