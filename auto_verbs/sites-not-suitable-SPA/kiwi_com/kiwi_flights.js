const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { origin: "Berlin", destination: "Rome", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    // Kiwi.com search URL
    const url = `https://www.kiwi.com/en/search/results/${CFG.origin.toLowerCase()}/${CFG.destination.toLowerCase()}/anytime/no-return`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(8000);

    // Use Stagehand AI extraction for complex SPA
    const data = await stagehand.extract(
      `Extract the top ${CFG.maxResults} flight options from this page. For each get: airline name, departure time, arrival time, duration, number of stops, and price.`,
      z.object({
        flights: z.array(z.object({
          airline: z.string(),
          departure: z.string(),
          arrival: z.string(),
          duration: z.string(),
          stops: z.string(),
          price: z.string(),
        }))
      })
    );

    recorder.record("extract", { results: data.flights });
    console.log("Extracted:", JSON.stringify(data.flights, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
