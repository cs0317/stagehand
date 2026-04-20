const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { query: "Ultra Light Down", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.uniqlo.com/us/en/search?q=${encodeURIComponent(CFG.query)}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(8000);

    const { products } = await stagehand.extract(
      `Extract the first ${CFG.maxResults} products. For each get: product name, price, colors, sizes, and rating.`,
      z.object({
        products: z.array(z.object({
          name: z.string().describe("Product name"),
          price: z.string().describe("Price"),
          colors: z.string().describe("Available colors"),
          sizes: z.string().describe("Available sizes"),
          rating: z.string().describe("Rating"),
        })),
      })
    );
    const items = products.slice(0, CFG.maxResults);
    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
