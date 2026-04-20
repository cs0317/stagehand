const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.wholefoodsmarket.com/sales-flyer`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(8000);

    const { deals } = await stagehand.extract(
      `Extract the first ${CFG.maxResults} weekly deals. For each get: product name, sale price, regular price, and discount/savings.`,
      z.object({
        deals: z.array(z.object({
          name: z.string().describe("Product name"),
          salePrice: z.string().describe("Sale price"),
          regularPrice: z.string().describe("Regular price"),
          savings: z.string().describe("Discount or savings"),
        })),
      })
    );
    const items = deals.slice(0, CFG.maxResults);
    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
