const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { query: "scarf", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.ravelry.com/patterns/search#query=${encodeURIComponent(CFG.query)}&craft=knitting&sort=best`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(8000);

    const { patterns } = await stagehand.extract(
      `Extract the first ${CFG.maxResults} knitting patterns. For each get: pattern name, designer, difficulty level, yarn weight, and number of projects made.`,
      z.object({
        patterns: z.array(z.object({
          name: z.string().describe("Pattern name"),
          designer: z.string().describe("Designer name"),
          difficulty: z.string().describe("Difficulty level"),
          yarn_weight: z.string().describe("Yarn weight"),
          projects: z.string().describe("Number of projects made"),
        })),
      })
    );

    const items = patterns.slice(0, CFG.maxResults);
    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
