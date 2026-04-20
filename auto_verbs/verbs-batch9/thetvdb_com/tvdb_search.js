const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { show: "Breaking Bad" };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://thetvdb.com/search?query=${encodeURIComponent(CFG.show)}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(3000);

    await stagehand.act(`Click on the "Breaking Bad" result to go to its detail page`);
    await page.waitForTimeout(5000);

    const { show } = await stagehand.extract(
      `Extract show info: name, network, status, first air date, last air date, number of seasons, number of episodes, genre, and rating.`,
      z.object({
        show: z.object({
          name: z.string().describe("Show name"),
          network: z.string().describe("Network"),
          status: z.string().describe("Status"),
          first_air_date: z.string().describe("First air date"),
          last_air_date: z.string().describe("Last air date"),
          seasons: z.string().describe("Number of seasons"),
          episodes: z.string().describe("Number of episodes"),
          genre: z.string().describe("Genre"),
          rating: z.string().describe("Rating"),
        }),
      })
    );
    recorder.record("extract", { results: show });
    console.log("Extracted:", JSON.stringify(show, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
