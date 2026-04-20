const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { query: "how to start a garden" };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.wikihow.com/wikiHowTo?search=${encodeURIComponent(CFG.query)}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(5000);

    // Click first result to go to article
    await stagehand.act("Click the first search result article about starting a garden");
    await page.waitForTimeout(5000);

    const info = await stagehand.extract(
      `Extract: article title, number of parts/sections, number of steps, expert co-author (if any), views, and a summary of the first 3 steps.`,
      z.object({
        title: z.string().describe("Article title"),
        parts: z.string().describe("Number of parts or sections"),
        steps: z.string().describe("Total number of steps"),
        expert: z.string().describe("Expert co-author if any"),
        views: z.string().describe("Number of views"),
        firstSteps: z.string().describe("Summary of the first 3 steps"),
      })
    );
    recorder.record("extract", { results: info });
    console.log("Extracted:", JSON.stringify(info, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
