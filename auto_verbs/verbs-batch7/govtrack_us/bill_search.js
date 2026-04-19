const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  searchQuery: "climate change",
  maxResults: 5,
  waits: { page: 5000, action: 2000 },
};

function genPython(cfg, recorder) {
  return `# See bill_search.py (generated directly)`;
}

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder(stagehand.page);
  const page = stagehand.page;

  try {
    const q = encodeURIComponent(CFG.searchQuery);
    await page.goto(`https://www.govtrack.us/search?q=${q}`, { waitUntil: "domcontentloaded" });
    recorder.record("navigate", "bill_search", "Navigate to GovTrack search");
    await page.waitForTimeout(CFG.waits.page);

    const data = await stagehand.extract(
      `Extract the first ${CFG.maxResults} bills: bill number, title, sponsor, status, and date introduced.`
    );
    recorder.record("extract", "bills", JSON.stringify(data));
    console.log("Extracted:", JSON.stringify(data, null, 2));

    const outDir = path.dirname(__filename || ".");
    fs.writeFileSync(path.join(outDir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(outDir, "bill_search.py"), pyCode);
    console.log("Done");
  } finally {
    await stagehand.close();
  }
})();
