const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = { maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = "https://lemmy.ml/communities?listingType=Local&sort=TopMonth";
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(5000);

    const items = await page.evaluate((max) => {
      const results = [];
      const rows = document.querySelectorAll(
        'table tbody tr, .community-listing tr, [class*="community"] li, .list-group-item'
      );
      const seen = new Set();
      for (const row of rows) {
        if (results.length >= max) break;

        const nameEl = row.querySelector('a[href*="/c/"], [class*="name"], td a');
        const name = nameEl ? nameEl.textContent.trim() : '';
        if (!name || seen.has(name)) continue;
        seen.add(name);

        let description = '';
        const descEl = row.querySelector('[class*="description"], td:nth-child(2), p');
        if (descEl) description = descEl.textContent.trim().substring(0, 200);

        let subscribers = '';
        const text = row.textContent.replace(/\s+/g, ' ');
        const subMatch = text.match(/([\d,]+)\s*(?:subscriber|member|user)/i);
        if (subMatch) subscribers = subMatch[1];

        let posts = '';
        const postMatch = text.match(/([\d,]+)\s*(?:post|thread)/i);
        if (postMatch) posts = postMatch[1];

        // If no subscribers found, try td cells
        if (!subscribers) {
          const tds = row.querySelectorAll('td');
          if (tds.length >= 3) {
            subscribers = tds[tds.length - 2]?.textContent.trim() || '';
            posts = tds[tds.length - 1]?.textContent.trim() || '';
          }
        }

        results.push({ name, description, subscribers, posts });
      }
      return results;
    }, CFG.maxResults);

    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
