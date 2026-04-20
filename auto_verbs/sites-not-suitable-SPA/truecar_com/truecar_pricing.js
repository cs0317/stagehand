const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { make: "Ford", model: "F-150", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.truecar.com/prices-new/ford/f-150-pricing/`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(8000);

    const { trims } = await stagehand.extract(
      `Extract the first ${CFG.maxResults} model/trim options. For each get: trim name, MSRP, TrueCar average price, potential savings, and nearby inventory count.`,
      z.object({
        trims: z.array(z.object({
          trim: z.string().describe("Trim name"),
          msrp: z.string().describe("MSRP"),
          avg_price: z.string().describe("TrueCar average price paid"),
          savings: z.string().describe("Potential savings"),
          inventory: z.string().describe("Nearby dealer inventory count"),
        })),
      })
    );
    const items = trims.slice(0, CFG.maxResults);
    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
