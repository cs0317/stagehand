const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Freepik – Search for design resources
 *
 * Extracts: title, url, resource_type, is_premium.
 */

const CFG = {
  searchQuery: "business infographic template",
  maxResults: 5,
  waits: { page: 6000, action: 2000 },
};

function genPython(cfg, recorder) {
  return `# See freepik_search.py (generated directly)`;
}

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder(stagehand.page);
  const page = stagehand.page;

  try {
    const q = encodeURIComponent(CFG.searchQuery);
    await page.goto(`https://www.freepik.com/search?format=search&query=${q}`, { waitUntil: "domcontentloaded" });
    recorder.record("navigate", "freepik_search", "Navigate to Freepik search");
    await page.waitForTimeout(CFG.waits.page);

    const data = await stagehand.extract(
      `Extract the first ${CFG.maxResults} search results with title, URL, resource type (vector/photo/PSD), and whether it is premium.`
    );
    recorder.record("extract", "resources", JSON.stringify(data));
    console.log("Extracted:", JSON.stringify(data, null, 2));

    const outDir = path.dirname(__filename || ".");
    fs.writeFileSync(path.join(outDir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(outDir, "freepik_search.py"), pyCode);
    console.log("Done");
  } finally {
    await stagehand.close();
  }
})();
