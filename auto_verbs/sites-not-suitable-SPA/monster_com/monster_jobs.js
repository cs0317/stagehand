const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { query: "software engineer", location: "Seattle, WA", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.monster.com/jobs/search?q=${encodeURIComponent(CFG.query)}&where=${encodeURIComponent(CFG.location)}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(10000);
    await page.evaluate(() => window.scrollBy(0, 1000));
    await page.waitForTimeout(3000);

    const { jobs } = await stagehand.extract(
      `Extract the first ${CFG.maxResults} job listings. For each get: job title, company name, location, salary range (if shown), and post date.`,
      z.object({
        jobs: z.array(z.object({
          title: z.string().describe("Job title"),
          company: z.string().describe("Company name"),
          location: z.string().describe("Job location"),
          salary: z.string().describe("Salary range if shown"),
          date: z.string().describe("Post date"),
        })),
      })
    );

    const items = jobs.slice(0, CFG.maxResults).map(j => ({
      title: j.title,
      company: j.company,
      location: j.location,
      salary: j.salary,
      date: j.date,
    }));

    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
