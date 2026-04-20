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
    const url = "https://www.nba.com/standings";
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(10000);

    const { teams } = await stagehand.extract(
      `Extract all Eastern Conference teams from the standings. For each get: team name, wins, losses, win percentage, games behind, and streak.`,
      z.object({
        teams: z.array(z.object({
          team: z.string().describe("Team name"),
          wins: z.string().describe("Number of wins"),
          losses: z.string().describe("Number of losses"),
          win_pct: z.string().describe("Win percentage"),
          games_behind: z.string().describe("Games behind"),
          streak: z.string().describe("Current streak"),
        })),
      })
    );

    recorder.record("extract", { results: teams });
    console.log("Extracted:", JSON.stringify(teams, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
