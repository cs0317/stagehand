const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  url: "https://trakt.tv/search?query={query}",
  search_query: "breaking bad",
  max_results: 5,
  outputDir: __dirname,
};

function genPython(cfg, recorder) {
  const pyCode = recorder.generatePythonFromActions(cfg);
  const pyFile = path.join(cfg.outputDir, "trakt_search.py");
  fs.writeFileSync(pyFile, pyCode, "utf-8");
  console.log(`Python file written to ${pyFile}`);
}

(async () => {
  const stagehand = new Stagehand({
    env: "LOCAL",
    verbose: 1,
    headless: false,
  });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];

  try {
    const searchUrl = CFG.url.replace("{query}", encodeURIComponent(CFG.search_query));
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(3000);

    recorder.addStep("navigate", { url: searchUrl });

    const results = await stagehand.extract(
      `Extract up to ${CFG.max_results} search results from the Trakt search page. For each result extract the title, year, type (show or movie), rating, num_votes, runtime, genres, and overview.`,
      {
        results: [{
          title: "string",
          year: "string",
          type: "string",
          rating: "string",
          num_votes: "string",
          runtime: "string",
          genres: "string",
          overview: "string",
        }],
      }
    );

    recorder.addStep("extract", {
      description: "Extract search results",
      data: results,
    });

    const outputFile = path.join(CFG.outputDir, "trakt_search_results.json");
    fs.writeFileSync(outputFile, JSON.stringify(results, null, 2), "utf-8");
    console.log(`Results saved to ${outputFile}`);
    console.log(JSON.stringify(results, null, 2));

    genPython(CFG, recorder);
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
  }
})();
