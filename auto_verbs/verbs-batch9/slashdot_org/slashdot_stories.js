const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://slashdot.org/`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(5000);

    const { stories } = await stagehand.extract(
      `Extract the first ${CFG.maxResults} stories. For each get: headline, department tag, author, comment count, and post date.`,
      z.object({
        stories: z.array(z.object({
          headline: z.string().describe("Story headline"),
          department: z.string().describe("Department tag"),
          author: z.string().describe("Author"),
          comments: z.string().describe("Comment count"),
          post_date: z.string().describe("Post date"),
        })),
      })
    );
    const items = stories.slice(0, CFG.maxResults);
    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
