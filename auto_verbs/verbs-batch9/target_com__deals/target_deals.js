const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { category: "Electronics", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.target.com/circle/deals`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(8000);

    await stagehand.act(`Navigate to or filter by the "${CFG.category}" category`);
    await page.waitForTimeout(5000);

    const { deals } = await stagehand.extract(
      `Extract the first ${CFG.maxResults} deals. For each get: product name, original price, deal price, discount percentage, and deal expiration.`,
      z.object({
        deals: z.array(z.object({
          name: z.string().describe("Product name"),
          original_price: z.string().describe("Original price"),
          deal_price: z.string().describe("Deal price"),
          discount: z.string().describe("Discount percentage"),
          expiration: z.string().describe("Deal expiration"),
        })),
      })
    );
    const items = deals.slice(0, CFG.maxResults);
    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
