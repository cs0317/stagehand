const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  url: "https://www.usaspending.gov/search",
  search_query: "education",
  max_results: 5,
  outputDir: __dirname,
};

function genPython(cfg, recorder) {
  const pyCode = recorder.generatePythonFromActions(cfg);
  const pyFile = path.join(cfg.outputDir, "usaspending_search.py");
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
    await page.goto(CFG.url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2000);

    recorder.addStep("navigate", { url: CFG.url });

    await stagehand.act(`Type "${CFG.search_query}" into the keyword search input field`);
    await page.waitForTimeout(1000);
    await stagehand.act("Click the search or submit button");
    await page.waitForTimeout(3000);

    recorder.addStep("search", { query: CFG.search_query });

    const results = await stagehand.extract(
      `Extract up to ${CFG.max_results} spending award results from USAspending.gov. For each award extract the recipient_name, award_amount, awarding_agency, award_type, date, and description.`,
      {
        results: [{
          recipient_name: "string",
          award_amount: "string",
          awarding_agency: "string",
          award_type: "string",
          date: "string",
          description: "string",
        }],
      }
    );

    recorder.addStep("extract", {
      description: "Extract spending award results",
      data: results,
    });

    const outputFile = path.join(CFG.outputDir, "usaspending_search_results.json");
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
