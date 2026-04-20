const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { maxResults: 10 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.whoscored.com/Statistics`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(8000);

    const { players } = await stagehand.extract(
      `Extract the top ${CFG.maxResults} rated Premier League players. For each get: name, team, position, appearances, goals, assists, and WhoScored rating.`,
      z.object({
        players: z.array(z.object({
          name: z.string().describe("Player name"),
          team: z.string().describe("Team"),
          position: z.string().describe("Position"),
          appearances: z.string().describe("Appearances"),
          goals: z.string().describe("Goals"),
          assists: z.string().describe("Assists"),
          rating: z.string().describe("WhoScored rating"),
        })),
      })
    );
    const items = players.slice(0, CFG.maxResults);
    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
