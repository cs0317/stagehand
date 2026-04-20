const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { query: "moon landing 1969", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.newspapers.com/search/?query=${encodeURIComponent(CFG.query)}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(5000);

    const { results: articles } = await stagehand.extract(
      `Extract the first ${CFG.maxResults} search results. For each get: newspaper name, date, headline, location, and snippet.`,
      z.object({
        results: z.array(z.object({
          newspaper: z.string().describe("Newspaper name"),
          date: z.string().describe("Publication date"),
          headline: z.string().describe("Headline or title"),
          location: z.string().describe("Location"),
          snippet: z.string().describe("Text snippet"),
        })),
      })
    );

    const items = articles.slice(0, CFG.maxResults);
    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
