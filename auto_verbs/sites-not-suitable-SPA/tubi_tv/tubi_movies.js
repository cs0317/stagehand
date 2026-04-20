const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { genre: "Thriller", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://tubitv.com/category/thriller`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(8000);

    const { movies } = await stagehand.extract(
      `Extract the first ${CFG.maxResults} movies. For each get: title, year, rating (PG-13, R, etc.), duration, and description.`,
      z.object({
        movies: z.array(z.object({
          title: z.string().describe("Movie title"),
          year: z.string().describe("Release year"),
          rating: z.string().describe("Content rating"),
          duration: z.string().describe("Duration"),
          description: z.string().describe("Description"),
        })),
      })
    );
    const items = movies.slice(0, CFG.maxResults);
    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
