const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { query: "organic snacks", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.walmart.com/search?q=${encodeURIComponent(CFG.query)}&cat_id=976759`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(8000);

    const { products } = await stagehand.extract(
      `Extract the first ${CFG.maxResults} grocery products. For each get: product name, price, price per unit, rating, and availability.`,
      z.object({
        products: z.array(z.object({
          name: z.string().describe("Product name"),
          price: z.string().describe("Price"),
          pricePerUnit: z.string().describe("Price per unit"),
          rating: z.string().describe("Rating"),
          availability: z.string().describe("Availability status"),
        })),
      })
    );
    const items = products.slice(0, CFG.maxResults);
    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
