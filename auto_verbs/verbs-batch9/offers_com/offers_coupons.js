const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { store: "Amazon", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.offers.com/amazon/`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(5000);

    const { offers } = await stagehand.extract(
      `Extract the first ${CFG.maxResults} coupon offers. For each get: offer description, discount type (% off, $ off, free shipping), code if applicable, and expiration date.`,
      z.object({
        offers: z.array(z.object({
          description: z.string().describe("Offer description"),
          discount_type: z.string().describe("Discount type (% off, $ off, free shipping)"),
          code: z.string().describe("Coupon code if available"),
          expiration: z.string().describe("Expiration date"),
        })),
      })
    );

    const items = offers.slice(0, CFG.maxResults);
    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
