const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { query: "CRISPR gene editing", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://phys.org/search/?search=${encodeURIComponent(CFG.query)}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(8000);
    // Scroll to trigger lazy loading
    await page.evaluate(() => window.scrollBy(0, 800));
    await page.waitForTimeout(3000);

    const { articles } = await stagehand.extract(
      `Extract the first ${CFG.maxResults} articles. For each get: title, source institution, publish date, and summary.`,
      z.object({
        articles: z.array(z.object({
          title: z.string().describe("Article title"),
          source: z.string().describe("Source institution"),
          date: z.string().describe("Publish date"),
          summary: z.string().describe("Article summary"),
        })),
      })
    );

    const items = articles.slice(0, CFG.maxResults);
    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
