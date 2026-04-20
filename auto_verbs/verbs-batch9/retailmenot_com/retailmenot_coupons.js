const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { store: "Nike", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.retailmenot.com/view/nike.com`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(5000);

    const { coupons } = await stagehand.extract(
      `Extract the first ${CFG.maxResults} coupons. For each get: description, discount amount/percentage, coupon code, expiration date, and success rate.`,
      z.object({
        coupons: z.array(z.object({
          description: z.string().describe("Coupon description"),
          discount: z.string().describe("Discount amount or percentage"),
          code: z.string().describe("Coupon code if available"),
          expiration: z.string().describe("Expiration date"),
          success_rate: z.string().describe("Success rate"),
        })),
      })
    );
    const items = coupons.slice(0, CFG.maxResults);
    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
