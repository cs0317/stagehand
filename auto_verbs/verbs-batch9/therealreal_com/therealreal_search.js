const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { designer: "Gucci", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.therealreal.com/designers/gucci`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(8000);

    const { items } = await stagehand.extract(
      `Extract the first ${CFG.maxResults} items. For each get: item name, designer, condition, estimated retail price, and sale price.`,
      z.object({
        items: z.array(z.object({
          name: z.string().describe("Item name"),
          designer: z.string().describe("Designer"),
          condition: z.string().describe("Condition"),
          retail_price: z.string().describe("Estimated retail price"),
          sale_price: z.string().describe("Sale price"),
        })),
      })
    );
    const results = items.slice(0, CFG.maxResults);
    recorder.record("extract", { results });
    console.log("Extracted:", JSON.stringify(results, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
