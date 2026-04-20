const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { location: "Austin, TX", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.realtor.com/realestateandhomes-search/Austin_TX/price-300000-500000`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(8000);

    const { listings } = await stagehand.extract(
      `Extract the first ${CFG.maxResults} home listings. For each get: address, price, bedrooms, bathrooms, square footage, and listing status.`,
      z.object({
        listings: z.array(z.object({
          address: z.string().describe("Property address"),
          price: z.string().describe("Listing price"),
          bedrooms: z.string().describe("Number of bedrooms"),
          bathrooms: z.string().describe("Number of bathrooms"),
          sqft: z.string().describe("Square footage"),
          status: z.string().describe("Listing status"),
        })),
      })
    );

    const items = listings.slice(0, CFG.maxResults);
    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
