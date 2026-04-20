const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { location: "Los Angeles", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.zagat.com/l/los-angeles/best-restaurants`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(8000);

    const { restaurants } = await stagehand.extract(
      `Extract the first ${CFG.maxResults} top-rated restaurants. For each get: name, cuisine, neighborhood, Zagat food/decor/service scores, and price range.`,
      z.object({
        restaurants: z.array(z.object({
          name: z.string().describe("Restaurant name"),
          cuisine: z.string().describe("Cuisine type"),
          neighborhood: z.string().describe("Neighborhood"),
          foodScore: z.string().describe("Zagat food score"),
          decorScore: z.string().describe("Zagat decor score"),
          serviceScore: z.string().describe("Zagat service score"),
          priceRange: z.string().describe("Price range"),
        })),
      })
    );
    const items = restaurants.slice(0, CFG.maxResults);
    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
