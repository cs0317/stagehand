const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { searchQuery: "retirement planning", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.kiplinger.com/retirement/retirement-planning`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(5000);

    // Use Stagehand AI extraction for complex page structure
    const data = await stagehand.extract(
      `Extract the top ${CFG.maxResults} articles about retirement planning from this page. For each article get: title, author, publish date, category, and a brief summary.`,
      z.object({
        articles: z.array(z.object({
          title: z.string(),
          author: z.string(),
          publish_date: z.string(),
          category: z.string(),
          summary: z.string(),
        }))
      })
    );

    recorder.record("extract", { results: data.articles });
    console.log("Extracted:", JSON.stringify(data.articles, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    // Also dump page structure for Python script development
    const structure = await page.evaluate(() => {
      const articles = [];
      // Look for article-like containers
      document.querySelectorAll('article, [data-testid], [class*="listing"] > *, [class*="card"]').forEach(el => {
        const text = el.textContent.trim().substring(0, 100);
        if (text.length > 20) articles.push({ tag: el.tagName, classes: el.className.substring(0,80), text });
      });
      return articles.slice(0, 10);
    });
    console.log("\nPage structure:", JSON.stringify(structure, null, 2));  } finally { await stagehand.close(); }
})();
