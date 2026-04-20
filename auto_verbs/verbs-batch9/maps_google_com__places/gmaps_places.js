const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { searchQuery: "coffee shops near Times Square, New York", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.google.com/maps/search/${encodeURIComponent(CFG.searchQuery)}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(8000);

    const { places } = await stagehand.extract(
      `Extract the first ${CFG.maxResults} places from the search results. For each get the name, rating, number of reviews, address, opening hours status, and price level.`,
      z.object({
        places: z.array(z.object({
          name: z.string().describe("Place name"),
          rating: z.string().describe("Star rating"),
          reviews: z.string().describe("Number of reviews"),
          address: z.string().describe("Address"),
          hours: z.string().describe("Opening hours or open/closed status"),
          price_level: z.string().describe("Price level like $ or $$"),
        })),
      })
    );

    const items = places.slice(0, CFG.maxResults).map(p => ({
      name: p.name,
      rating: p.rating,
      reviews: p.reviews,
      address: p.address,
      hours: p.hours,
      price_level: p.price_level,
    }));

    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
