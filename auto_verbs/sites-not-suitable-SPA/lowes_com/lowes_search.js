const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { searchQuery: "cordless drills", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.lowes.com/search?searchTerm=${encodeURIComponent(CFG.searchQuery)}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    recorder.goto(url);
    await page.waitForTimeout(10000);

    const { products } = await stagehand.extract(
      `Extract the first ${CFG.maxResults} product results. For each get the product name, brand, price, voltage if shown, star rating, and number of reviews.`,
      z.object({
        products: z.array(z.object({
          name: z.string().describe("Product name"),
          brand: z.string().describe("Brand name"),
          price: z.string().describe("Price"),
          voltage: z.string().describe("Voltage if shown"),
          rating: z.string().describe("Star rating"),
          reviews: z.string().describe("Number of reviews"),
        })),
      })
    );

    const items = products.slice(0, CFG.maxResults).map(p => ({
      name: p.name,
      brand: p.brand,
      price: p.price,
      voltage: p.voltage,
      rating: p.rating,
      reviews: p.reviews,
    }));

    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
