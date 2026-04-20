const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = { tag: "inspirational", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.goodreads.com/quotes/tag/${encodeURIComponent(CFG.tag)}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(5000);

    const items = await page.evaluate((max) => {
      const results = [];
      const quotes = document.querySelectorAll('.quote, [class*="quoteDetails"], [class*="quote"]');
      for (const q of quotes) {
        if (results.length >= max) break;

        let text = '';
        const textEl = q.querySelector('.quoteText, [class*="quoteText"]');
        if (textEl) {
          text = textEl.textContent.trim();
          // Clean up the quote text - remove the author part after the dash
          const dashIdx = text.lastIndexOf('―');
          if (dashIdx > 0) text = text.substring(0, dashIdx).trim();
          text = text.replace(/^["\u201C]|["\u201D]$/g, '').trim();
        }
        if (!text || text.length < 10) continue;

        let author = '';
        const authorEl = q.querySelector('.authorOrTitle, .quoteAuthor, a[class*="author"]');
        if (authorEl) author = authorEl.textContent.trim().replace(/,$/, '');

        let book = '';
        const bookEl = q.querySelector('.authorOrTitle + a, a[class*="title"], i');
        if (bookEl) book = bookEl.textContent.trim();

        let likes = '';
        const likesEl = q.querySelector('.right a, [class*="like"], .quoteFooter a');
        if (likesEl) {
          const likesMatch = likesEl.textContent.match(/(\d[\d,]*)\s*likes?/i);
          if (likesMatch) likes = likesMatch[1];
        }

        results.push({ text: text.substring(0, 300), author, book, likes });
      }
      return results;
    }, CFG.maxResults);

    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
