const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = { searchQuery: "dashboard", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.figma.com/community/search?resource_type=mixed&sort_by=relevancy&query=${encodeURIComponent(CFG.searchQuery)}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(5000);

    const items = await page.evaluate((max) => {
      const results = [];
      const cards = document.querySelectorAll('[class*="resource_card"], [class*="community_hub"], [class*="card"], article');
      for (const card of cards) {
        if (results.length >= max) break;
        const titleEl = card.querySelector('h3, h2, [class*="title"], a[class*="name"]');
        const name = titleEl ? titleEl.textContent.trim() : '';
        if (!name || name.length < 3) continue;
        if (results.some(r => r.name === name)) continue;

        const text = (card.textContent || '').replace(/\s+/g, ' ').trim();

        let creator = '';
        const creatorEl = card.querySelector('[class*="creator"], [class*="author"], [class*="user"]');
        if (creatorEl) creator = creatorEl.textContent.trim().replace(/^by\s*/i, '');

        let likes = '';
        const likeMatch = text.match(/([\d,.]+[kKmM]?)\s*(?:like|heart|❤)/i);
        if (likeMatch) likes = likeMatch[1];
        if (!likes) {
          const likeEl = card.querySelector('[class*="like"] span, [class*="heart"] span');
          if (likeEl) likes = likeEl.textContent.trim();
        }

        let duplicates = '';
        const dupMatch = text.match(/([\d,.]+[kKmM]?)\s*(?:duplicate|fork|copy|remix)/i);
        if (dupMatch) duplicates = dupMatch[1];

        let description = '';
        const descEl = card.querySelector('p, [class*="description"], [class*="desc"]');
        if (descEl) description = descEl.textContent.trim().substring(0, 200);

        results.push({ name, creator, likes, duplicates, description });
      }
      return results;
    }, CFG.maxResults);

    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
