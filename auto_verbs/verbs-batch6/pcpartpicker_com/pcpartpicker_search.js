const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = { query: "RTX 4070 graphics card", maxResults: 5, waits: { page: 5000, action: 2000 } };

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  return `# See pcpartpicker_search.py for the generated Python script\n# Generated: ${ts}\n# Actions: ${recorder.actions.length}\n`;
}

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", verbose: 1, llmClient, localBrowserLaunchOptions: { headless: false, args: ["--disable-blink-features=AutomationControlled", "--start-maximized"] } });
  await stagehand.init();
  const page = stagehand.context.pages()[0];
  const recorder = new PlaywrightRecorder();
  try {
    const searchUrl = `https://www.google.com/search?q=site%3Apcpartpicker.com+${encodeURIComponent(CFG.query)}`;
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url: searchUrl, description: "Navigate to Google site search for PCPartPicker" });
    const results = await stagehand.extract(`extract up to ${CFG.maxResults} PC parts with name, price, and URL`);
    console.log("\n📊 Results:", JSON.stringify(results, null, 2));
    recorder.record("extract", { results });
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } catch (err) { console.error("Error:", err.message); }
  finally { await stagehand.close(); process.exit(0); }
})();
