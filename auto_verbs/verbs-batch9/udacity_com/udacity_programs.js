const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { topic: "artificial intelligence", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.udacity.com/catalog`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(5000);

    await stagehand.act(`Search or filter for "${CFG.topic}" programs`);
    await page.waitForTimeout(5000);

    const { programs } = await stagehand.extract(
      `Extract the first ${CFG.maxResults} programs. For each get: program name, estimated duration, skill level, and key skills covered.`,
      z.object({
        programs: z.array(z.object({
          name: z.string().describe("Program name"),
          duration: z.string().describe("Estimated duration"),
          level: z.string().describe("Skill level"),
          skills: z.string().describe("Key skills covered"),
        })),
      })
    );
    const items = programs.slice(0, CFG.maxResults);
    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
