const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { destination: "Cancun, Mexico", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.orbitz.com/Cancun-Hotels.d602678.Travel-Guide-Hotels`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(8000);

    const { packages } = await stagehand.extract(
      `Extract the first ${CFG.maxResults} vacation packages or hotels. For each get: hotel name, whether flight is included, total price, duration, and rating.`,
      z.object({
        packages: z.array(z.object({
          hotel_name: z.string().describe("Hotel name"),
          flight_included: z.string().describe("Whether flight is included"),
          total_price: z.string().describe("Total price"),
          duration: z.string().describe("Duration of stay"),
          rating: z.string().describe("Rating"),
        })),
      })
    );

    const items = packages.slice(0, CFG.maxResults);
    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
