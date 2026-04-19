const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  city: "Chicago, IL",
  maxPrice: 2000,
  maxResults: 5,
  waits: { page: 6000, action: 2000 },
};

function genPython(cfg, recorder) {
  return `# See apartment_search.py (generated directly)`;
}

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder(stagehand.page);
  const page = stagehand.page;

  try {
    const slug = CFG.city.toLowerCase().replace(/,?\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    const url = `https://hotpads.com/${slug}/apartments-for-rent?maxPrice=${CFG.maxPrice}`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    recorder.record("navigate", "apartment_search", "Navigate to HotPads search");
    await page.waitForTimeout(CFG.waits.page);

    const data = await stagehand.extract(
      `Extract the first ${CFG.maxResults} apartment listings: name, price, bedrooms, and location.`
    );
    recorder.record("extract", "apartments", JSON.stringify(data));
    console.log("Extracted:", JSON.stringify(data, null, 2));

    const outDir = path.dirname(__filename || ".");
    fs.writeFileSync(path.join(outDir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(outDir, "apartment_search.py"), pyCode);
    console.log("Done");
  } finally {
    await stagehand.close();
  }
})();
