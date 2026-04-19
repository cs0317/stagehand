const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Flashscore – Extract today's soccer matches
 *
 * Extracts: home_team, away_team, score, league, status.
 */

const CFG = {
  maxResults: 5,
  waits: { page: 5000, action: 2000 },
};

function genPython(cfg, recorder) {
  return `# See flashscore_matches.py (generated directly)`;
}

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder(stagehand.page);
  const page = stagehand.page;

  try {
    await page.goto("https://www.flashscore.com/", { waitUntil: "domcontentloaded" });
    recorder.record("navigate", "flashscore", "Navigate to Flashscore");
    await page.waitForTimeout(CFG.waits.page);

    const data = await stagehand.extract(
      `Extract the first ${CFG.maxResults} soccer matches with home team, away team, score, league name, and match status.`
    );
    recorder.record("extract", "matches", JSON.stringify(data));
    console.log("Extracted:", JSON.stringify(data, null, 2));

    const outDir = path.dirname(__filename || ".");
    fs.writeFileSync(path.join(outDir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    console.log("Done");
  } finally {
    await stagehand.close();
  }
})();
