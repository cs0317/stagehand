const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  url: "https://www.tipranks.com/stocks/{ticker}",
  ticker: "AAPL",
  outputDir: __dirname,
};

function genPython(cfg, recorder) {
  const pyCode = recorder.generatePythonFromActions(cfg);
  const pyFile = path.join(cfg.outputDir, "tipranks_search.py");
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
    const stockUrl = CFG.url.replace("{ticker}", encodeURIComponent(CFG.ticker));
    await page.goto(stockUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(5000);

    recorder.addStep("navigate", { url: stockUrl });

    const results = await stagehand.extract(
      `Extract the stock analyst rating information from the TipRanks page for ticker ${CFG.ticker}. Extract the ticker, company_name, analyst_consensus, price_target, smart_score, num_analysts, and sector.`,
      {
        ticker: "string",
        company_name: "string",
        analyst_consensus: "string",
        price_target: "string",
        smart_score: "string",
        num_analysts: "string",
        sector: "string",
      }
    );

    recorder.addStep("extract", {
      description: "Extract stock analyst ratings",
      data: results,
    });

    const outputFile = path.join(CFG.outputDir, "tipranks_search_results.json");
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
