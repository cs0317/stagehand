const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  searchQuery: "content calendar",
  maxResults: 5,
  waits: { page: 5000, action: 2000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  return `# Auto-generated — Airtable template search — ${ts}`;
}

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.page;
  try {
    const encoded = encodeURIComponent(CFG.searchQuery);
    await page.goto(`https://www.airtable.com/templates/search/${encoded}`, { waitUntil: "domcontentloaded" });
    recorder.goto(`https://www.airtable.com/templates/search/${encoded}`);
    await page.waitForTimeout(CFG.waits.page);
    const data = await stagehand.extract(`Extract the top ${CFG.maxResults} templates with name, category, description, and number of uses.`);
    recorder.record("extract", { description: "templates", results: data });
    console.log("Extracted:", JSON.stringify(data, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
