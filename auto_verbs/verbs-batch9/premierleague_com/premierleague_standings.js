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
    const url = "https://www.premierleague.com/tables";
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(8000);

    const { teams } = await stagehand.extract(
      `Extract the top 10 teams from the standings table. For each get: position, team name, played, won, drawn, lost, goals for, goals against, goal difference, and points.`,
      z.object({
        teams: z.array(z.object({
          position: z.string().describe("Position in table"),
          team: z.string().describe("Team name"),
          played: z.string().describe("Games played"),
          won: z.string().describe("Games won"),
          drawn: z.string().describe("Games drawn"),
          lost: z.string().describe("Games lost"),
          goals_for: z.string().describe("Goals for"),
          goals_against: z.string().describe("Goals against"),
          goal_diff: z.string().describe("Goal difference"),
          points: z.string().describe("Points"),
        })),
      })
    );

    const items = teams.slice(0, 10);
    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
