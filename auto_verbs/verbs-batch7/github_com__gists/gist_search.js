const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * GitHub Gists – Search for gists
 *
 * Extracts: author, description, stars, forks, url, created.
 */

const CFG = {
  searchQuery: "python web scraper",
  maxResults: 5,
  waits: { page: 5000, action: 2000 },
};

function genPython(cfg, recorder) {
  return `# See gist_search.py (generated directly)`;
}

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder(stagehand.page);
  const page = stagehand.page;

  try {
    const q = encodeURIComponent(CFG.searchQuery);
    await page.goto(`https://gist.github.com/search?q=${q}`, { waitUntil: "domcontentloaded" });
    recorder.record("navigate", "gist_search", "Navigate to GitHub Gists search");
    await page.waitForTimeout(CFG.waits.page);

    const data = await stagehand.extract(
      `Extract the first ${CFG.maxResults} gists with description, author username, stars, forks, and creation date.`
    );
    recorder.record("extract", "gists", JSON.stringify(data));
    console.log("Extracted:", JSON.stringify(data, null, 2));

    const outDir = path.dirname(__filename || ".");
    fs.writeFileSync(path.join(outDir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(outDir, "gist_search.py"), pyCode);
    console.log("Done");
  } finally {
    await stagehand.close();
  }
})();
