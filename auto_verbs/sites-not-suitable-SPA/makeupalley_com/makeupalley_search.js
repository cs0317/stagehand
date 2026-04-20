const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { searchQuery: "mascara", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.makeupalley.com/product/searching?product-name=${encodeURIComponent(CFG.searchQuery)}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(5000);

    const { products } = await stagehand.extract(
      `Extract the first ${CFG.maxResults} product results. For each get the product name, brand, average rating, number of reviews, and repurchase percentage if shown.`,
      z.object({
        products: z.array(z.object({
          name: z.string().describe("Product name"),
          brand: z.string().describe("Brand name"),
          rating: z.string().describe("Average rating"),
          reviews: z.string().describe("Number of reviews"),
          repurchase: z.string().describe("Repurchase percentage"),
        })),
      })
    );

    const items = products.slice(0, CFG.maxResults).map(p => ({
      name: p.name,
      brand: p.brand,
      rating: p.rating,
      reviews: p.reviews,
      repurchase: p.repurchase,
    }));

    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
