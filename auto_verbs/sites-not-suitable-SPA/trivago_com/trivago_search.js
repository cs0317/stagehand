const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { destination: "Barcelona, Spain", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.trivago.com/`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(5000);

    await stagehand.act(`Type "${CFG.destination}" in the search field and select the first suggestion`);
    await page.waitForTimeout(2000);
    await stagehand.act(`Click the search button`);
    await page.waitForTimeout(8000);

    const { hotels } = await stagehand.extract(
      `Extract the first ${CFG.maxResults} hotels. For each get: hotel name, star rating, guest rating, price per night, and neighborhood.`,
      z.object({
        hotels: z.array(z.object({
          name: z.string().describe("Hotel name"),
          stars: z.string().describe("Star rating"),
          guest_rating: z.string().describe("Guest rating"),
          price: z.string().describe("Price per night"),
          neighborhood: z.string().describe("Neighborhood"),
        })),
      })
    );
    const items = hotels.slice(0, CFG.maxResults);
    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
