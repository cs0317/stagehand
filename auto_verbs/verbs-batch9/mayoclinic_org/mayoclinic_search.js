const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { query: "high blood pressure" };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.mayoclinic.org/search/search-results?q=${encodeURIComponent(CFG.query)}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(3000);

    // Click the first relevant result to get to the condition page
    await stagehand.act(`Click the first search result about high blood pressure`);
    await page.waitForTimeout(5000);

    const { info } = await stagehand.extract(
      `Extract information about this condition: the condition name, definition/overview, symptoms, causes, risk factors, and when to see a doctor.`,
      z.object({
        info: z.object({
          condition_name: z.string().describe("Name of the condition"),
          definition: z.string().describe("Definition/overview"),
          symptoms: z.string().describe("Symptoms listed"),
          causes: z.string().describe("Causes"),
          risk_factors: z.string().describe("Risk factors"),
          when_to_see_doctor: z.string().describe("When to see a doctor"),
        }),
      })
    );

    recorder.record("extract", { result: info });
    console.log("Extracted:", JSON.stringify(info, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
