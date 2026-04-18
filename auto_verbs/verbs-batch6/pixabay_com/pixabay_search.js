const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs"); const path = require("path");
const CFG = { query: "ocean waves", maxResults: 5, waits: { page: 5000 } };
(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", verbose: 1, llmClient, localBrowserLaunchOptions: { headless: false, args: ["--disable-blink-features=AutomationControlled"] } });
  await stagehand.init(); const page = stagehand.context.pages()[0]; const recorder = new PlaywrightRecorder();
  try {
    await page.goto(`https://www.google.com/search?q=site%3Apixabay.com+${encodeURIComponent(CFG.query)}+image`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page); recorder.record("goto", {});
    const r = await stagehand.extract(`extract up to ${CFG.maxResults} images with title and URL`);
    console.log(JSON.stringify(r, null, 2)); recorder.record("extract", { r });
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } catch (e) { console.error(e.message); } finally { await stagehand.close(); process.exit(0); }
})();
