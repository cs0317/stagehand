const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { searchQuery: "audience segmentation", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = "https://mailchimp.com/resources/";
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(5000);

    const { resources } = await stagehand.extract(
      `Extract the first ${CFG.maxResults} resources shown on this page. For each get the title, type (guide, article, tutorial, etc.), and summary/description.`,
      z.object({
        resources: z.array(z.object({
          title: z.string().describe("Resource title"),
          type: z.string().describe("Resource type like guide, article, tutorial"),
          summary: z.string().describe("Summary or description"),
        })),
      })
    );

    const items = resources.slice(0, CFG.maxResults).map(r => ({
      title: r.title,
      type: r.type,
      summary: r.summary,
    }));

    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
