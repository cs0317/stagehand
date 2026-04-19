const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  query: "The Legend of Zelda",
  maxResults: 5,
  waits: { page: 8000 },
};

function genPython(cfg, recorder) {
  return `# See game_search.py (generated directly)`;
}

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder(stagehand.page);
  const page = stagehand.page;

  try {
    const q = encodeURIComponent(CFG.query);
    await page.goto(`https://www.igdb.com/search?type=1&q=${q}`, { waitUntil: "domcontentloaded" });
    recorder.record("navigate", "game_search", "Navigate to IGDB search");
    await page.waitForTimeout(CFG.waits.page);

    const data = await stagehand.extract(
      `Extract the first ${CFG.maxResults} game results: title, release year, platforms, and category.`
    );
    recorder.record("extract", "games", JSON.stringify(data));
    console.log("Extracted:", JSON.stringify(data, null, 2));

    const outDir = path.dirname(__filename || ".");
    fs.writeFileSync(path.join(outDir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(outDir, "game_search.py"), pyCode);
    console.log("Done");
  } finally {
    await stagehand.close();
  }
})();
