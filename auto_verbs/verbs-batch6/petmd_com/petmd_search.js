const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");
const CFG = { query: "dog ear infection treatment", maxResults: 5, waits: { page: 5000, action: 2000 } };
function genPython(cfg, recorder) { return `# See petmd_search.py\n`; }
(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", verbose: 1, llmClient, localBrowserLaunchOptions: { headless: false, args: ["--disable-blink-features=AutomationControlled", "--start-maximized"] } });
  await stagehand.init();
  const page = stagehand.context.pages()[0];
  const recorder = new PlaywrightRecorder();
  try {
    const searchUrl = `https://www.google.com/search?q=site%3Apetmd.com+${encodeURIComponent(CFG.query)}`;
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url: searchUrl });
    const results = await stagehand.extract(`extract up to ${CFG.maxResults} articles with title and URL`);
    console.log("\n📊 Results:", JSON.stringify(results, null, 2));
    recorder.record("extract", { results });
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } catch (err) { console.error("Error:", err.message); }
  finally { await stagehand.close(); process.exit(0); }
})();
