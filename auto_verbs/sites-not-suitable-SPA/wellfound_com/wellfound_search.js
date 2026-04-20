const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { query: "machine learning", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://wellfound.com/role/l/machine-learning-engineer`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(8000);

    const { jobs } = await stagehand.extract(
      `Extract the first ${CFG.maxResults} startup job listings. For each get: job title, company name, salary range, equity range, and company stage (seed, series A, etc.).`,
      z.object({
        jobs: z.array(z.object({
          title: z.string().describe("Job title"),
          company: z.string().describe("Company name"),
          salary: z.string().describe("Salary range"),
          equity: z.string().describe("Equity range"),
          stage: z.string().describe("Company stage"),
        })),
      })
    );
    const items = jobs.slice(0, CFG.maxResults);
    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
