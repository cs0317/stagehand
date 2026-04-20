const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { from: "London", to: "Paris", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.thetrainline.com/`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(5000);

    await stagehand.act(`Type "${CFG.from}" in the "From" field and select the first suggestion`);
    await page.waitForTimeout(2000);
    await stagehand.act(`Type "${CFG.to}" in the "To" field and select the first suggestion`);
    await page.waitForTimeout(2000);
    await stagehand.act(`Click the search or "Get times & tickets" button`);
    await page.waitForTimeout(8000);

    const { trains } = await stagehand.extract(
      `Extract the first ${CFG.maxResults} train options. For each get: operator, departure time, arrival time, duration, and price.`,
      z.object({
        trains: z.array(z.object({
          operator: z.string().describe("Train operator"),
          departure: z.string().describe("Departure time"),
          arrival: z.string().describe("Arrival time"),
          duration: z.string().describe("Duration"),
          price: z.string().describe("Price"),
        })),
      })
    );
    const items = trains.slice(0, CFG.maxResults);
    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
