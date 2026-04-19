const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  maxResults: 10,
  waits: { page: 5000 },
};

function genPython(cfg, recorder) {
  return `# See box_office.py (generated directly)`;
}

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder(stagehand.page);
  const page = stagehand.page;

  try {
    await page.goto("https://www.imdb.com/chart/boxoffice", { waitUntil: "domcontentloaded" });
    recorder.record("navigate", "box_office", "Navigate to IMDb box office");
    await page.waitForTimeout(CFG.waits.page);

    const data = await stagehand.extract(
      `Extract the top ${CFG.maxResults} box office movies: title, weekend gross, total gross, and weeks released.`
    );
    recorder.record("extract", "movies", JSON.stringify(data));
    console.log("Extracted:", JSON.stringify(data, null, 2));

    const outDir = path.dirname(__filename || ".");
    fs.writeFileSync(path.join(outDir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(outDir, "box_office.py"), pyCode);
    console.log("Done");
  } finally {
    await stagehand.close();
  }
})();
