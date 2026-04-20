const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { query: "chicken soup", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://cooking.nytimes.com/search?q=${encodeURIComponent(CFG.query)}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(5000);

    const { recipes } = await stagehand.extract(
      `Extract the first ${CFG.maxResults} recipes. For each get: recipe name, author, rating, number of ratings, and prep time.`,
      z.object({
        recipes: z.array(z.object({
          name: z.string().describe("Recipe name"),
          author: z.string().describe("Author"),
          rating: z.string().describe("Rating"),
          num_ratings: z.string().describe("Number of ratings"),
          prep_time: z.string().describe("Prep time"),
        })),
      })
    );

    const items = recipes.slice(0, CFG.maxResults);
    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
