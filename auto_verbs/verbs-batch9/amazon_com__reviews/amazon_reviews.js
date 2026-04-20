const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = { searchQuery: "kindle paperwhite", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.page;
  try {
    const encoded = encodeURIComponent(CFG.searchQuery);
    await page.goto(`https://www.amazon.com/s?k=${encoded}`, { waitUntil: "domcontentloaded" });
    recorder.goto(`https://www.amazon.com/s?k=${encoded}`);
    await page.waitForTimeout(5000);
    await stagehand.act("click on the first product listing title");
    recorder.record("act", { action: "click first product" });
    await page.waitForTimeout(5000);
    await stagehand.act("scroll down to the customer reviews section");
    recorder.record("act", { action: "scroll to reviews" });
    await page.waitForTimeout(3000);
    const data = await stagehand.extract(`Extract the top ${CFG.maxResults} customer reviews with reviewer name, star rating, review title, date, and review text.`);
    recorder.record("extract", { results: data });
    console.log("Extracted:", JSON.stringify(data, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
