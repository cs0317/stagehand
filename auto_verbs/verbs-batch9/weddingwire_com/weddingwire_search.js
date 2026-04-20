const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { location: "Chicago, Illinois", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.weddingwire.com/c/il-illinois/chicago-wedding-photographers/10-vendors.html`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(8000);

    const { photographers } = await stagehand.extract(
      `Extract the first ${CFG.maxResults} wedding photographers. For each get: name, price range, rating, number of reviews, and location.`,
      z.object({
        photographers: z.array(z.object({
          name: z.string().describe("Photographer name"),
          priceRange: z.string().describe("Price range"),
          rating: z.string().describe("Rating"),
          reviews: z.string().describe("Number of reviews"),
          location: z.string().describe("Location"),
        })),
      })
    );
    const items = photographers.slice(0, CFG.maxResults);
    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
