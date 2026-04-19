const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Federal Register – Search documents
 *
 * Extracts: title, agency, document_type, publication_date, summary, url.
 */

const CFG = {
  searchQuery: "artificial intelligence",
  maxResults: 5,
  waits: { page: 5000, action: 2000 },
};

function genPython(cfg, recorder) {
  return `# See federalregister_search.py (generated directly)`;
}

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder(stagehand.page);
  const page = stagehand.page;

  try {
    const encoded = encodeURIComponent(CFG.searchQuery);
    await page.goto(`https://www.federalregister.gov/documents/search?conditions%5Bterm%5D=${encoded}`, { waitUntil: "domcontentloaded" });
    recorder.record("navigate", "federal register search", "Navigate to search");
    await page.waitForTimeout(CFG.waits.page);

    const data = await stagehand.extract(
      `Extract the first ${CFG.maxResults} document results with title, publishing agency, document type, publication date, summary, and URL.`
    );
    recorder.record("extract", "documents", JSON.stringify(data));
    console.log("Extracted:", JSON.stringify(data, null, 2));

    const outDir = path.dirname(__filename || ".");
    fs.writeFileSync(path.join(outDir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    console.log("Done");
  } finally {
    await stagehand.close();
  }
})();
