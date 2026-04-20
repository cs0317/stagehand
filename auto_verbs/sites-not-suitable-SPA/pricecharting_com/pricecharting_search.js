const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { query: "Super Mario Bros", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.pricecharting.com/search-products?q=${encodeURIComponent(CFG.query)}&type=prices`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(5000);

    const { listings } = await stagehand.extract(
      `Extract the first ${CFG.maxResults} game listings. For each get: game title, platform, loose price, complete price, new price, and price trend.`,
      z.object({
        listings: z.array(z.object({
          title: z.string().describe("Game title"),
          platform: z.string().describe("Platform/console"),
          loose_price: z.string().describe("Loose price"),
          complete_price: z.string().describe("Complete price"),
          new_price: z.string().describe("New/sealed price"),
          trend: z.string().describe("Price trend"),
        })),
      })
    );

    const items = listings.slice(0, CFG.maxResults);
    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
