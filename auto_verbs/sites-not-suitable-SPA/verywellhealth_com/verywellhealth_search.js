const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { query: "vitamin B12 deficiency", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.verywellhealth.com/search?q=${encodeURIComponent(CFG.query)}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(8000);

    const { articles } = await stagehand.extract(
      `Extract the first ${CFG.maxResults} articles. For each get: title, author, medical reviewer, publish date, and summary.`,
      z.object({
        articles: z.array(z.object({
          title: z.string().describe("Article title"),
          author: z.string().describe("Author name"),
          reviewer: z.string().describe("Medical reviewer"),
          date: z.string().describe("Publish date"),
          summary: z.string().describe("Brief summary"),
        })),
      })
    );
    const items = articles.slice(0, CFG.maxResults);
    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
