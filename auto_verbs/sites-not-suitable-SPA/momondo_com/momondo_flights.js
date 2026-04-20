const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { from: "Chicago", to: "Tokyo", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.momondo.com/flight-search/CHI-TYO/2025-06-15?sort=price_a`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    recorder.goto(url);
    await page.waitForTimeout(15000);

    const { flights } = await stagehand.extract(
      `Extract the first ${CFG.maxResults} cheapest flights. For each get: airline, departure time, arrival time, duration, number of stops, and price.`,
      z.object({
        flights: z.array(z.object({
          airline: z.string().describe("Airline name"),
          departure: z.string().describe("Departure time"),
          arrival: z.string().describe("Arrival time"),
          duration: z.string().describe("Flight duration"),
          stops: z.string().describe("Number of stops"),
          price: z.string().describe("Price"),
        })),
      })
    );

    const items = flights.slice(0, CFG.maxResults).map(f => ({
      airline: f.airline,
      departure: f.departure,
      arrival: f.arrival,
      duration: f.duration,
      stops: f.stops,
      price: f.price,
    }));

    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
