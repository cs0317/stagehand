const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = { searchQuery: "The Legend of Zelda Tears of the Kingdom", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://gamefaqs.gamespot.com/search?game=${encodeURIComponent(CFG.searchQuery)}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(5000);

    // Try to click the first game result to get to the FAQs page
    try {
      const gameLink = page.locator('a[class*="result"], .search_result a, td a').first();
      await gameLink.click({ timeout: 5000 });
      await page.waitForTimeout(3000);
      // Navigate to FAQs section
      const currentUrl = page.url();
      if (!currentUrl.includes('/faqs')) {
        await page.goto(currentUrl.replace(/\/?$/, '/faqs'), { waitUntil: "domcontentloaded", timeout: 30000 });
        await page.waitForTimeout(3000);
      }
    } catch(e) { console.log("Could not navigate to game FAQs page:", e.message); }

    const items = await page.evaluate((max) => {
      const results = [];
      const rows = document.querySelectorAll('tr, [class*="faq"], [class*="guide"], article, li[class*="item"]');
      for (const row of rows) {
        if (results.length >= max) break;
        const titleEl = row.querySelector('a, [class*="title"], h3, h2');
        const title = titleEl ? titleEl.textContent.trim() : '';
        if (!title || title.length < 5) continue;
        if (results.some(r => r.title === title)) continue;

        const text = (row.textContent || '').replace(/\s+/g, ' ').trim();

        let author = '';
        const cells = row.querySelectorAll('td');
        if (cells.length >= 2) author = cells[1]?.textContent?.trim() || '';
        if (!author) {
          const authEl = row.querySelector('[class*="author"], [class*="user"]');
          if (authEl) author = authEl.textContent.trim();
        }

        let guideType = '';
        const typeMatch = text.match(/(walkthrough|faq|guide|cheat|map|review|hint|tip)/i);
        if (typeMatch) guideType = typeMatch[0];

        let rating = '';
        const ratingMatch = text.match(/(\d+\.?\d*)\s*(?:\/\s*\d+|%|star)/i);
        if (ratingMatch) rating = ratingMatch[0];

        results.push({ title, author, guide_type: guideType, rating });
      }
      return results;
    }, CFG.maxResults);

    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
