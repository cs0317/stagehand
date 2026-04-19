const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  url: "https://www.tripadvisor.com/Search?q={query}&searchSessionId=hotels",
  destination: "Paris",
  max_results: 5,
  outputDir: __dirname,
};

function genPython(cfg, recorder) {
  const pyCode = recorder.generatePythonFromActions(cfg);
  const pyFile = path.join(cfg.outputDir, "tripadvisor_hotels_search.py");
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
    const searchUrl = CFG.url.replace("{query}", encodeURIComponent(CFG.destination));
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(3000);

    recorder.addStep("navigate", { url: searchUrl });

    const results = await stagehand.extract(
      `Extract up to ${CFG.max_results} hotel search results from TripAdvisor. For each hotel extract the hotel_name, rating, num_reviews, price_per_night, location, and amenities.`,
      {
        results: [{
          hotel_name: "string",
          rating: "string",
          num_reviews: "string",
          price_per_night: "string",
          location: "string",
          amenities: "string",
        }],
      }
    );

    recorder.addStep("extract", {
      description: "Extract hotel search results",
      data: results,
    });

    const outputFile = path.join(CFG.outputDir, "tripadvisor_hotels_search_results.json");
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
