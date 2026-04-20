const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = { service: "web development", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.page;
  try {
    const url = `https://clutch.co/web-developers`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    recorder.goto(url);
    await page.waitForTimeout(5000);
    const data = await stagehand.extract(`Extract the top ${CFG.maxResults} agencies with company name, location, minimum project size, hourly rate, rating, and number of reviews.`);
    recorder.record("extract", { results: data });
    console.log("Extracted:", JSON.stringify(data, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
