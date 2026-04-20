const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = { category: "baby", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.page;
  try {
    await page.goto("https://www.amazon.com/subscribe-save/", { waitUntil: "domcontentloaded" });
    recorder.goto("https://www.amazon.com/subscribe-save/");
    await page.waitForTimeout(5000);
    await stagehand.act(`click on the "${CFG.category}" category`);
    recorder.record("act", { action: `click ${CFG.category} category` });
    await page.waitForTimeout(5000);
    const data = await stagehand.extract(`Extract the top ${CFG.maxResults} Subscribe & Save items with product name, regular price, Subscribe & Save price, and discount percentage.`);
    recorder.record("extract", { results: data });
    console.log("Extracted:", JSON.stringify(data, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
