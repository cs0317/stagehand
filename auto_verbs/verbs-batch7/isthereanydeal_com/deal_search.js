const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  query: "Baldur's Gate 3",
  waits: { page: 6000, action: 2000 },
};

function genPython(cfg, recorder) {
  return `# See deal_search.py (generated directly)`;
}

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder(stagehand.page);
  const page = stagehand.page;

  try {
    const q = encodeURIComponent(CFG.query);
    await page.goto(`https://isthereanydeal.com/search/?q=${q}`, { waitUntil: "domcontentloaded" });
    recorder.record("navigate", "deal_search", "Navigate to ITAD search");
    await page.waitForTimeout(CFG.waits.page);

    const data = await stagehand.extract(
      `Extract game name, current best price, store name, historical low price, and regular price.`
    );
    recorder.record("extract", "deal_info", JSON.stringify(data));
    console.log("Extracted:", JSON.stringify(data, null, 2));

    const outDir = path.dirname(__filename || ".");
    fs.writeFileSync(path.join(outDir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(outDir, "deal_search.py"), pyCode);
    console.log("Done");
  } finally {
    await stagehand.close();
  }
})();
