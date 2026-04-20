const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { query: "Type 2 Diabetes" };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.webmd.com/search/search_results/default.aspx?query=${encodeURIComponent(CFG.query)}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(8000);

    const info = await stagehand.extract(
      `Extract information about Type 2 Diabetes: condition name, overview, symptoms list, causes, risk factors, and treatment options.`,
      z.object({
        condition: z.string().describe("Condition name"),
        overview: z.string().describe("Overview"),
        symptoms: z.string().describe("Symptoms list"),
        causes: z.string().describe("Causes"),
        riskFactors: z.string().describe("Risk factors"),
        treatments: z.string().describe("Treatment options"),
      })
    );
    recorder.record("extract", { results: info });
    console.log("Extracted:", JSON.stringify(info, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
