const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  city: "denver",
  state: "co",
  maxResults: 5,
  waits: { page: 6000 },
};

function genPython(cfg, recorder) {
  return `# See listing_search.py (generated directly)`;
}

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder(stagehand.page);
  const page = stagehand.page;

  try {
    await page.goto(`https://www.movoto.com/${CFG.city}-${CFG.state}/`, { waitUntil: "domcontentloaded" });
    recorder.record("navigate", "listing_search", "Navigate to Movoto listings");
    await page.waitForTimeout(CFG.waits.page);

    const data = await stagehand.extract(
      `Extract the first ${CFG.maxResults} home listings: address, price, bedrooms, bathrooms, and square footage.`
    );
    recorder.record("extract", "listings", JSON.stringify(data));
    console.log("Extracted:", JSON.stringify(data, null, 2));

    const outDir = path.dirname(__filename || ".");
    fs.writeFileSync(path.join(outDir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    console.log("Done");
  } finally {
    await stagehand.close();
  }
})();
