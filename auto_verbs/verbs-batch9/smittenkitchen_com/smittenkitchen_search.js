const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { tag: "vegetarian", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://smittenkitchen.com/tag/${CFG.tag}/`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(5000);

    const { recipes } = await stagehand.extract(
      `Extract the first ${CFG.maxResults} recipes. For each get: recipe name, publish date, description, and comment count.`,
      z.object({
        recipes: z.array(z.object({
          name: z.string().describe("Recipe name"),
          publish_date: z.string().describe("Publish date"),
          description: z.string().describe("Description"),
          comments: z.string().describe("Comment count"),
        })),
      })
    );
    const items = recipes.slice(0, CFG.maxResults);
    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
