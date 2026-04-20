const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { query: "React development", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.upwork.com/search/profiles/?q=${encodeURIComponent(CFG.query)}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(8000);

    const { freelancers } = await stagehand.extract(
      `Extract the first ${CFG.maxResults} freelancers. For each get: name, title, hourly rate, job success score, total earnings, and skills.`,
      z.object({
        freelancers: z.array(z.object({
          name: z.string().describe("Freelancer name"),
          title: z.string().describe("Title"),
          rate: z.string().describe("Hourly rate"),
          success: z.string().describe("Job success score"),
          earnings: z.string().describe("Total earnings"),
          skills: z.string().describe("Skills"),
        })),
      })
    );
    const items = freelancers.slice(0, CFG.maxResults);
    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
