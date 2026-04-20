const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { country: "us", maxResults: 10 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://charts.spotify.com/charts/view/regional-${CFG.country}-weekly/latest`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(8000);

    const { songs } = await stagehand.extract(
      `Extract the top ${CFG.maxResults} songs from the chart. For each get: rank, song title, artist, peak position, and weeks on chart.`,
      z.object({
        songs: z.array(z.object({
          rank: z.string().describe("Chart rank"),
          title: z.string().describe("Song title"),
          artist: z.string().describe("Artist name"),
          peak: z.string().describe("Peak position"),
          weeks: z.string().describe("Weeks on chart"),
        })),
      })
    );
    const items = songs.slice(0, CFG.maxResults);
    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
