const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { category: "Kitchen", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.zola.com/shop/kitchen`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(8000);

    const { items } = await stagehand.extract(
      `Extract the first ${CFG.maxResults} registry gift items. For each get: product name, brand, price, and number of registrants who added it.`,
      z.object({
        items: z.array(z.object({
          name: z.string().describe("Product name"),
          brand: z.string().describe("Brand"),
          price: z.string().describe("Price"),
          registrants: z.string().describe("Number of registrants who added it"),
        })),
      })
    );
    const results = items.slice(0, CFG.maxResults);
    recorder.record("extract", { results });
    console.log("Extracted:", JSON.stringify(results, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
