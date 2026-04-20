const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = { searchQuery: "Elden Ring" };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.giantbomb.com/search/?i=&q=${encodeURIComponent(CFG.searchQuery)}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(5000);

    const items = await page.evaluate(() => {
      const results = [];
      const cards = document.querySelectorAll('.search-result, [class*="search-results"] li, article, [class*="result"]');
      for (const card of cards) {
        if (results.length >= 5) break;
        const titleEl = card.querySelector('a h3, h3 a, h2 a, a[class*="title"], h3, h2');
        const title = titleEl ? titleEl.textContent.trim() : '';
        if (!title || title.length < 3) continue;
        if (results.some(r => r.title === title)) continue;

        const text = (card.textContent || '').replace(/\s+/g, ' ').trim();

        let platforms = '';
        const platMatch = text.match(/(?:platforms?|available on)[:\s]*([\w\s,\/]+)/i);
        if (platMatch) platforms = platMatch[1].trim();

        let releaseDate = '';
        const dateMatch = text.match(/(?:release[d]?\s*(?:date)?|launch)[:\s]*(\w+\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2})/i);
        if (dateMatch) releaseDate = dateMatch[1];

        let developer = '';
        const devMatch = text.match(/(?:developer|developed by)[:\s]*([\w\s]+?)(?:\s*publisher|\s*genre|\s*$)/i);
        if (devMatch) developer = devMatch[1].trim();

        let publisher = '';
        const pubMatch = text.match(/(?:publisher|published by)[:\s]*([\w\s]+?)(?:\s*genre|\s*$)/i);
        if (pubMatch) publisher = pubMatch[1].trim();

        let genre = '';
        const genMatch = text.match(/(?:genre|type)[:\s]*([\w\s,\/]+?)(?:\s*rating|\s*$)/i);
        if (genMatch) genre = genMatch[1].trim();

        let rating = '';
        const rateMatch = text.match(/(?:rating|score)[:\s]*([\d.]+(?:\s*\/\s*[\d.]+)?)/i);
        if (rateMatch) rating = rateMatch[1];

        const linkEl = card.querySelector('a[href]');
        const link = linkEl ? linkEl.href : '';

        results.push({ title, platforms, release_date: releaseDate, developer, publisher, genre, rating, link });
      }
      return results;
    });

    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
