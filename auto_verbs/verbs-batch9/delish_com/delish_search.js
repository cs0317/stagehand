const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = { searchQuery: "slow cooker", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.delish.com/search/?q=${encodeURIComponent(CFG.searchQuery)}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(5000);

    const items = await page.evaluate((max) => {
      const results = [];
      const cards = document.querySelectorAll('a[href*="/recipe"], a[href*="/cooking/"]');
      for (const card of cards) {
        if (results.length >= max) break;
        const name = (card.querySelector('h2, h3, [class*="title"]') || {}).textContent || '';
        if (!name || name.trim().length < 5) continue;
        const trimName = name.trim();
        if (results.some(r => r.name === trimName)) continue;
        const desc = (card.querySelector('p, [class*="dek"]') || {}).textContent || '';
        results.push({ name: trimName, description: desc.trim().substring(0, 200) });
      }
      return results;
    }, CFG.maxResults);

    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
