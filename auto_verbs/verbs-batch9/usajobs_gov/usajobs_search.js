const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { query: "information technology", location: "Washington, DC", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.usajobs.gov/search/results/?k=${encodeURIComponent(CFG.query)}&l=${encodeURIComponent(CFG.location)}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(8000);

    const { jobs } = await stagehand.extract(
      `Extract the first ${CFG.maxResults} job listings. For each get: job title, agency, salary range, grade level, and closing date.`,
      z.object({
        jobs: z.array(z.object({
          title: z.string().describe("Job title"),
          agency: z.string().describe("Agency name"),
          salary: z.string().describe("Salary range"),
          grade: z.string().describe("Grade level"),
          closing: z.string().describe("Closing date"),
        })),
      })
    );
    const items = jobs.slice(0, CFG.maxResults);
    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
