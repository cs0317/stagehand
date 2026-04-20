const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = { zipCode: "90210", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.fandango.com/${CFG.zipCode}_movietimes`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(5000);

    const items = await page.evaluate((max) => {
      const results = [];
      const cards = document.querySelectorAll('[class*="movie-pod"], [class*="MovieItem"], [class*="movie-listing"], article, li[class*="movie"]');
      for (const card of cards) {
        if (results.length >= max) break;
        const titleEl = card.querySelector('h2, h3, h4, a[class*="title"], [class*="movie-title"], [class*="movieTitle"]');
        const title = titleEl ? titleEl.textContent.trim() : '';
        if (!title || title.length < 2) continue;
        if (results.some(r => r.title === title)) continue;

        const text = (card.textContent || '').replace(/\s+/g, ' ').trim();

        let genre = '';
        const genreEl = card.querySelector('[class*="genre"]');
        if (genreEl) genre = genreEl.textContent.trim();

        let runtime = '';
        const rtMatch = text.match(/(\d+\s*hr?\s*\d*\s*min|\d+\s*minutes?)/i);
        if (rtMatch) runtime = rtMatch[0];

        let score = '';
        const scoreMatch = text.match(/(\d+%|\d+\.?\d*\/\d+)/);
        if (scoreMatch) score = scoreMatch[0];

        let showtime = '';
        const timeEl = card.querySelector('a[class*="showtime"], button[class*="showtime"], time, [class*="time"]');
        if (timeEl) showtime = timeEl.textContent.trim();
        if (!showtime) {
          const timeMatch = text.match(/(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm))/);
          if (timeMatch) showtime = timeMatch[0];
        }

        results.push({ title, genre, runtime, score, next_showtime: showtime });
      }
      return results;
    }, CFG.maxResults);

    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
