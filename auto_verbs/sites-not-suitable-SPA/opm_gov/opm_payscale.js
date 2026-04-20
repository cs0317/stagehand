const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = "https://www.opm.gov/policy-data-oversight/pay-leave/salaries-wages/2024/general-schedule/";
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(5000);

    const { grades } = await stagehand.extract(
      `Extract the GS pay scale table. For each grade (GS-1 through GS-15), get: grade level, Step 1 annual salary, and Step 10 annual salary.`,
      z.object({
        grades: z.array(z.object({
          grade: z.string().describe("Grade level (e.g. GS-1)"),
          step1: z.string().describe("Step 1 annual salary"),
          step10: z.string().describe("Step 10 annual salary"),
        })),
      })
    );

    recorder.record("extract", { results: grades });
    console.log("Extracted:", JSON.stringify(grades, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
