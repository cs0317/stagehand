const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Formula 1 – Driver standings
 *
 * Extracts: position, driver_name, nationality, team, points.
 */

const CFG = {
  maxResults: 10,
  waits: { page: 5000, action: 2000 },
};

function genPython(cfg, recorder) {
  return `# See f1_standings.py (generated directly)`;
}

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder(stagehand.page);
  const page = stagehand.page;

  try {
    await page.goto("https://www.formula1.com/en/results/2025/drivers", { waitUntil: "domcontentloaded" });
    recorder.record("navigate", "f1_standings", "Navigate to F1 standings page");
    await page.waitForTimeout(CFG.waits.page);

    const data = await stagehand.extract(
      `Extract the top ${CFG.maxResults} F1 drivers from the standings table with position, driver name, nationality, team, and points.`
    );
    recorder.record("extract", "standings", JSON.stringify(data));
    console.log("Extracted:", JSON.stringify(data, null, 2));

    const outDir = path.dirname(__filename || ".");
    fs.writeFileSync(path.join(outDir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(outDir, "f1_standings.py"), pyCode);
    console.log("Done");
  } finally {
    await stagehand.close();
  }
})();
