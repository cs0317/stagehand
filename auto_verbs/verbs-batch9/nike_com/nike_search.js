const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { query: "running shoes men", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.nike.com/w/mens-running-shoes-37v7jznik1zy7ok`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(8000);

    const { products } = await stagehand.extract(
      `Extract the first ${CFG.maxResults} running shoes. For each get: shoe name, price, colors available, available sizes, and rating.`,
      z.object({
        products: z.array(z.object({
          name: z.string().describe("Shoe name"),
          price: z.string().describe("Price"),
          colors: z.string().describe("Number or list of colors"),
          sizes: z.string().describe("Available sizes"),
          rating: z.string().describe("Rating"),
        })),
      })
    );

    const items = products.slice(0, CFG.maxResults).map(p => ({
      name: p.name,
      price: p.price,
      colors: p.colors,
      sizes: p.sizes,
      rating: p.rating,
    }));

    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
