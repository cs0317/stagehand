const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = { searchQuery: "python", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://hub.docker.com/search?q=${encodeURIComponent(CFG.searchQuery)}`;
    await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
    recorder.goto(url);
    await page.waitForTimeout(8000);

    const items = await page.evaluate((max) => {
      const results = [];
      // Docker Hub uses various card structures
      const allLinks = document.querySelectorAll('a[href*="/r/"], a[href*="/_/"]');
      for (const link of allLinks) {
        if (results.length >= max) break;
        const card = link.closest('[class*="card"], [class*="result"], [class*="Row"], [class*="item"]') || link;
        const text = (card.textContent || '').replace(/\s+/g, ' ').trim();
        
        let name = '';
        const nameEl = card.querySelector('h3, h4, [class*="title"], [class*="name"]');
        if (nameEl) name = nameEl.textContent.trim();
        if (!name) {
          // Try extracting from link href
          const href = link.getAttribute('href') || '';
          const parts = href.split('/').filter(Boolean);
          name = parts.length >= 2 ? parts.slice(-1)[0] : parts.join('/');
        }
        if (!name || name.length < 2) continue;
        if (results.some(r => r.name === name)) continue;

        let pulls = '';
        const pullMatch = text.match(/([\d,.]+[KMB]?\+?)\s*/i);
        if (pullMatch) pulls = pullMatch[0].trim();

        results.push({ name, publisher: '', pulls, stars: '', last_updated: '' });
      }
      if (results.length === 0) {
        // Fallback: just grab text from the page
        const els = document.querySelectorAll('div[class*="esult"], div[class*="ard"]');
        for (const el of els) {
          if (results.length >= max) break;
          const t = el.textContent.trim().substring(0, 100);
          if (t.length > 10) results.push({ name: t, publisher: '', pulls: '', stars: '', last_updated: '' });
        }
      }
      return results;
    }, CFG.maxResults);

    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
