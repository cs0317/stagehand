const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = "https://lichess.org/training/themes";
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(5000);

    const { puzzles } = await stagehand.extract(
      `Extract up to ${CFG.maxResults} chess puzzle themes/categories from this page. For each get the theme name, number of puzzles available, and any rating or difficulty info shown.`,
      z.object({
        puzzles: z.array(z.object({
          theme: z.string().describe("Puzzle theme or motif name"),
          count: z.string().describe("Number of puzzles or plays"),
          rating: z.string().describe("Rating or difficulty level if shown"),
        })),
      })
    );

    const items = puzzles.slice(0, CFG.maxResults).map(p => ({
      theme: p.theme,
      count: p.count,
      rating: p.rating,
    }));

    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
