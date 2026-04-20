const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { genre: "supernatural", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.shudder.com/`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(5000);

    await stagehand.act(`Search or browse for "${CFG.genre}" films or navigate to the supernatural category`);
    await page.waitForTimeout(5000);

    const { movies } = await stagehand.extract(
      `Extract the first ${CFG.maxResults} movies. For each get: title, year, director, duration, and description.`,
      z.object({
        movies: z.array(z.object({
          title: z.string().describe("Movie title"),
          year: z.string().describe("Release year"),
          director: z.string().describe("Director"),
          duration: z.string().describe("Duration"),
          description: z.string().describe("Movie description"),
        })),
      })
    );
    const items = movies.slice(0, CFG.maxResults);
    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
