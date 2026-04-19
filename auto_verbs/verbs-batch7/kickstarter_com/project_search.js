const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  query: "board game",
  maxResults: 5,
  waits: { page: 6000 },
};

function genPython(cfg, recorder) {
  return `# See project_search.py (generated directly)`;
}

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder(stagehand.page);
  const page = stagehand.page;

  try {
    const q = encodeURIComponent(CFG.query);
    await page.goto(`https://www.kickstarter.com/discover/advanced?term=${q}&sort=magic`, { waitUntil: "domcontentloaded" });
    recorder.record("navigate", "project_search", "Navigate to Kickstarter search");
    await page.waitForTimeout(CFG.waits.page);

    const data = await stagehand.extract(
      `Extract the first ${CFG.maxResults} project results: name, creator, days remaining, percent funded, description, and category.`
    );
    recorder.record("extract", "projects", JSON.stringify(data));
    console.log("Extracted:", JSON.stringify(data, null, 2));

    const outDir = path.dirname(__filename || ".");
    fs.writeFileSync(path.join(outDir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(outDir, "project_search.py"), pyCode);
    console.log("Done");
  } finally {
    await stagehand.close();
  }
})();
