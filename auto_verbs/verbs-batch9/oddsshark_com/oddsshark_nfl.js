const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = "https://www.oddsshark.com/nfl/odds";
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(8000);

    const { games } = await stagehand.extract(
      `Extract all NFL game odds shown. For each get: teams, spread, over/under, moneyline odds, and game time.`,
      z.object({
        games: z.array(z.object({
          teams: z.string().describe("Team matchup"),
          spread: z.string().describe("Point spread"),
          over_under: z.string().describe("Over/under total"),
          moneyline: z.string().describe("Moneyline odds"),
          game_time: z.string().describe("Game time"),
        })),
      })
    );

    recorder.record("extract", { results: games });
    console.log("Extracted:", JSON.stringify(games, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
