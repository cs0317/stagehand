const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { location: "New York City", cuisine: "Italian", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.opentable.com/s?covers=2&dateTime=2025-04-20T19%3A00&term=Italian&metroId=4`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(8000);

    const { restaurants } = await stagehand.extract(
      `Extract the first ${CFG.maxResults} Italian restaurants in NYC. For each get: name, cuisine, price range, rating, number of reviews, and next available reservation time.`,
      z.object({
        restaurants: z.array(z.object({
          name: z.string().describe("Restaurant name"),
          cuisine: z.string().describe("Cuisine type"),
          price_range: z.string().describe("Price range (e.g. $$$)"),
          rating: z.string().describe("Rating"),
          num_reviews: z.string().describe("Number of reviews"),
          next_available: z.string().describe("Next available reservation time"),
        })),
      })
    );

    const items = restaurants.slice(0, CFG.maxResults);
    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
