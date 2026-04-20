const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { location: "San Francisco, CA", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.yelp.com/events?location=${encodeURIComponent(CFG.location)}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(8000);

    const { events } = await stagehand.extract(
      `Extract the first ${CFG.maxResults} upcoming events. For each get: event name, date, venue, category, and description.`,
      z.object({
        events: z.array(z.object({
          name: z.string().describe("Event name"),
          date: z.string().describe("Date"),
          venue: z.string().describe("Venue"),
          category: z.string().describe("Category"),
          description: z.string().describe("Description"),
        })),
      })
    );
    const items = events.slice(0, CFG.maxResults);
    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
