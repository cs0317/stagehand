const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  location: "Joshua Tree, CA",
  lat: "34.1347",
  lng: "-116.3131",
  maxResults: 5,
  waits: { page: 8000, action: 2000 },
};

function genPython(cfg, recorder) {
  return `# See campsite_search.py (generated directly)`;
}

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder(stagehand.page);
  const page = stagehand.page;

  try {
    const q = encodeURIComponent(CFG.location);
    await page.goto(`https://www.hipcamp.com/en-US/search?q=${q}&lat=${CFG.lat}&lng=${CFG.lng}`, { waitUntil: "domcontentloaded" });
    recorder.record("navigate", "campsite_search", "Navigate to Hipcamp search");
    await page.waitForTimeout(CFG.waits.page);

    const data = await stagehand.extract(
      `Extract the first ${CFG.maxResults} camping sites: name, price, site type, rating, and review count.`
    );
    recorder.record("extract", "campsites", JSON.stringify(data));
    console.log("Extracted:", JSON.stringify(data, null, 2));

    const outDir = path.dirname(__filename || ".");
    fs.writeFileSync(path.join(outDir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(outDir, "campsite_search.py"), pyCode);
    console.log("Done");
  } finally {
    await stagehand.close();
  }
})();
