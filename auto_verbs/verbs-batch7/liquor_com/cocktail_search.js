const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  query: "margarita",
  maxResults: 3,
  waits: { page: 5000 },
};

function genPython(cfg, recorder) {
  return `# See cocktail_search.py (generated directly)`;
}

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder(stagehand.page);
  const page = stagehand.page;

  try {
    const q = encodeURIComponent(CFG.query);
    await page.goto(`https://www.liquor.com/search?q=${q}`, { waitUntil: "domcontentloaded" });
    recorder.record("navigate", "cocktail_search", "Navigate to Liquor.com search");
    await page.waitForTimeout(CFG.waits.page);

    const data = await stagehand.extract(
      `Extract the first ${CFG.maxResults} cocktail recipe names and their URLs.`
    );
    recorder.record("extract", "cocktails", JSON.stringify(data));
    console.log("Extracted:", JSON.stringify(data, null, 2));

    const outDir = path.dirname(__filename || ".");
    fs.writeFileSync(path.join(outDir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(outDir, "cocktail_search.py"), pyCode);
    console.log("Done");
  } finally {
    await stagehand.close();
  }
})();
