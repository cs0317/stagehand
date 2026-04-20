const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = { searchQuery: "LED strip lights", maxResults: 5, waits: { page: 5000 } };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.page;
  try {
    const encoded = encodeURIComponent(CFG.searchQuery);
    await page.goto(`https://www.alibaba.com/trade/search?SearchText=${encoded}`, { waitUntil: "domcontentloaded" });
    recorder.goto(`https://www.alibaba.com/trade/search?SearchText=${encoded}`);
    await page.waitForTimeout(CFG.waits.page);
    const data = await stagehand.extract(`Extract the top ${CFG.maxResults} products with name, supplier, price range, minimum order quantity, and supplier rating.`);
    recorder.record("extract", { results: data });
    console.log("Extracted:", JSON.stringify(data, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
