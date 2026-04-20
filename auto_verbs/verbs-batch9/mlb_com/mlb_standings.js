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
    const url = "https://www.mlb.com/standings/american-league";
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(10000);
    // Scroll to load standings table
    await page.evaluate(() => window.scrollBy(0, 500));
    await page.waitForTimeout(3000);

    const { teams } = await stagehand.extract(
      `Extract all American League teams from the standings. For each get: team name, wins, losses, win percentage, games behind, and last 10 record.`,
      z.object({
        teams: z.array(z.object({
          team: z.string().describe("Team name"),
          wins: z.string().describe("Number of wins"),
          losses: z.string().describe("Number of losses"),
          win_pct: z.string().describe("Win percentage"),
          games_behind: z.string().describe("Games behind"),
          last_10: z.string().describe("Last 10 games record"),
        })),
      })
    );

    recorder.record("extract", { results: teams });
    console.log("Extracted:", JSON.stringify(teams, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
