const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { show: "The Office" };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.tvmaze.com/search?q=${encodeURIComponent(CFG.show)}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(3000);

    await stagehand.act(`Click on "The Office" (the US version) to go to its detail page`);
    await page.waitForTimeout(5000);

    const { show } = await stagehand.extract(
      `Extract show info: name, network, status, premiered date, genres, rating, and the first 5 episodes with titles and air dates.`,
      z.object({
        show: z.object({
          name: z.string().describe("Show name"),
          network: z.string().describe("Network"),
          status: z.string().describe("Status"),
          premiered: z.string().describe("Premiered date"),
          genres: z.string().describe("Genres"),
          rating: z.string().describe("Rating"),
          episodes: z.array(z.object({
            title: z.string().describe("Episode title"),
            air_date: z.string().describe("Air date"),
          })),
        }),
      })
    );
    recorder.record("extract", { results: show });
    console.log("Extracted:", JSON.stringify(show, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
