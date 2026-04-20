const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { location: "Miami International Airport", days: 5, maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = "https://www.rentalcars.com/";
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(5000);
    await stagehand.act(`Type "Miami International Airport" in the pickup location field`);
    await page.waitForTimeout(3000);
    await stagehand.act(`Select the first suggestion for Miami International Airport`);
    await page.waitForTimeout(2000);

    const { options } = await stagehand.extract(
      `Extract the first ${CFG.maxResults} car rental options. For each get: car type, rental company, price per day, total price, and included features.`,
      z.object({
        options: z.array(z.object({
          car_type: z.string().describe("Car type/model"),
          company: z.string().describe("Rental company"),
          price_per_day: z.string().describe("Price per day"),
          total_price: z.string().describe("Total price"),
          features: z.string().describe("Included features"),
        })),
      })
    );
    const items = options.slice(0, CFG.maxResults);
    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
