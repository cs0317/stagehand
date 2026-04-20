const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { location: "Denver, CO", bedrooms: 2, maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.rent.com/colorado/denver-apartments/2-bedrooms`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(8000);

    const { listings } = await stagehand.extract(
      `Extract the first ${CFG.maxResults} apartment listings. For each get: property name, rent range, bedrooms, bathrooms, square footage, and amenities.`,
      z.object({
        listings: z.array(z.object({
          name: z.string().describe("Property name"),
          rent_range: z.string().describe("Rent range"),
          bedrooms: z.string().describe("Bedrooms"),
          bathrooms: z.string().describe("Bathrooms"),
          sqft: z.string().describe("Square footage"),
          amenities: z.string().describe("Key amenities"),
        })),
      })
    );
    const items = listings.slice(0, CFG.maxResults);
    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
