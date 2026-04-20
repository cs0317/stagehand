const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { topic: "retirement benefits" };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.ssa.gov/benefits/retirement/`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(5000);

    const { info } = await stagehand.extract(
      `Extract retirement benefits information: topic name, eligibility age, benefit calculation overview, and links to key resources.`,
      z.object({
        info: z.object({
          topic: z.string().describe("Topic name"),
          eligibility_age: z.string().describe("Eligibility age"),
          benefit_calculation: z.string().describe("Benefit calculation overview"),
          resources: z.array(z.object({
            title: z.string().describe("Resource title"),
            url: z.string().describe("Resource URL"),
          })),
        }),
      })
    );
    recorder.record("extract", { results: info });
    console.log("Extracted:", JSON.stringify(info, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
