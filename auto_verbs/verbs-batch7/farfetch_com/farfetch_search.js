const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Farfetch – Search products
 *
 * Extracts search results: brand, product_name, price, url.
 */

const CFG = {
  searchQuery: "Gucci bags",
  maxResults: 5,
  waits: { page: 6000, action: 2000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `# See farfetch_search.py (generated directly)`;
}

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder(stagehand.page);
  const page = stagehand.page;

  try {
    const encoded = encodeURIComponent(CFG.searchQuery);
    await page.goto(`https://www.farfetch.com/shopping/women/search/items.aspx?q=${encoded}`, { waitUntil: "domcontentloaded" });
    recorder.record("navigate", "farfetch search", "Navigate to search");
    await page.waitForTimeout(CFG.waits.page);

    const data = await stagehand.extract(
      `Extract the first ${CFG.maxResults} product cards with brand, product name, price, and URL.`
    );
    recorder.record("extract", "products", JSON.stringify(data));
    console.log("Extracted:", JSON.stringify(data, null, 2));

    const outDir = path.dirname(__filename || ".");
    fs.writeFileSync(path.join(outDir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    console.log("Done");
  } finally {
    await stagehand.close();
  }
})();
