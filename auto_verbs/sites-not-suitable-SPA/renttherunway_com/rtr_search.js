const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { event: "black tie", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.renttherunway.com/shop/dress?occasion=black_tie`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(8000);

    const { dresses } = await stagehand.extract(
      `Extract the first ${CFG.maxResults} dresses. For each get: designer, dress name, rental price, retail price, available sizes, and rating.`,
      z.object({
        dresses: z.array(z.object({
          designer: z.string().describe("Designer name"),
          name: z.string().describe("Dress name"),
          rental_price: z.string().describe("Rental price"),
          retail_price: z.string().describe("Retail price"),
          sizes: z.string().describe("Available sizes"),
          rating: z.string().describe("Rating"),
        })),
      })
    );
    const items = dresses.slice(0, CFG.maxResults);
    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
