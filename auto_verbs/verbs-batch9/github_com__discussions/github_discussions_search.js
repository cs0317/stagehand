const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = { searchQuery: "machine learning best practices", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://github.com/search?q=${encodeURIComponent(CFG.searchQuery)}&type=discussions`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(5000);

    const items = await page.evaluate((max) => {
      const results = [];
      const cards = document.querySelectorAll('[data-testid="results-list"] > div, .search-title, [class*="Box-row"]');
      for (const card of cards) {
        if (results.length >= max) break;
        const titleEl = card.querySelector('a[class*="Link"], a[href*="/discussions/"], h3 a, a');
        const title = titleEl ? titleEl.textContent.trim() : '';
        if (!title || title.length < 5) continue;
        if (results.some(r => r.title === title)) continue;

        let repo = '';
        const repoEl = card.querySelector('a[href*="github.com/"][class*="Link"]');
        if (repoEl) {
          const href = repoEl.getAttribute('href') || '';
          const repoMatch = href.match(/github\.com\/([\w-]+\/[\w.-]+)/);
          if (repoMatch) repo = repoMatch[1];
        }
        if (!repo) {
          const text = (card.textContent || '');
          const repoMatch2 = text.match(/([\w-]+\/[\w.-]+)\s*#\d+/);
          if (repoMatch2) repo = repoMatch2[1];
        }

        let author = '';
        const authorEl = card.querySelector('a[data-hovercard-type="user"], a[href*="github.com/"]');
        if (authorEl) {
          const href = authorEl.getAttribute('href') || '';
          const userMatch = href.match(/github\.com\/([\w-]+)$/);
          if (userMatch) author = userMatch[1];
        }

        const text = (card.textContent || '').replace(/\s+/g, ' ').trim();

        let answers = '';
        const ansMatch = text.match(/(\d+)\s*(?:answers?|replies|comments)/i);
        if (ansMatch) answers = ansMatch[1];

        let upvotes = '';
        const upMatch = text.match(/(\d+)\s*(?:upvotes?|votes?|likes?|thumbs)/i);
        if (upMatch) upvotes = upMatch[1];

        results.push({ title, repo, author, answers, upvotes });
      }
      return results;
    }, CFG.maxResults);

    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
