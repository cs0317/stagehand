const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { query: "data analyst", location: "Denver, CO", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.ziprecruiter.com/jobs-search?search=${encodeURIComponent(CFG.query)}&location=${encodeURIComponent(CFG.location)}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(8000);

    const { jobs } = await stagehand.extract(
      `Extract the first ${CFG.maxResults} job listings. For each get: job title, company, location, salary estimate, and days posted.`,
      z.object({
        jobs: z.array(z.object({
          title: z.string().describe("Job title"),
          company: z.string().describe("Company"),
          location: z.string().describe("Location"),
          salary: z.string().describe("Salary estimate"),
          posted: z.string().describe("Days posted"),
        })),
      })
    );
    const items = jobs.slice(0, CFG.maxResults);
    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
