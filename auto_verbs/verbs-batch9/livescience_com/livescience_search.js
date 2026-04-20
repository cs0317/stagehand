const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { searchQuery: "black holes", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.livescience.com/search?searchTerm=${encodeURIComponent(CFG.searchQuery)}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(5000);

    const { articles } = await stagehand.extract(
      `Extract the first ${CFG.maxResults} article search results. For each get the title, author name, publish date, and summary/description.`,
      z.object({
        articles: z.array(z.object({
          title: z.string().describe("Article title"),
          author: z.string().describe("Author name"),
          date: z.string().describe("Publish date"),
          summary: z.string().describe("Article summary or description"),
        })),
      })
    );

    const items = articles.slice(0, CFG.maxResults).map(a => ({
      title: a.title,
      author: a.author,
      date: a.date,
      summary: a.summary,
    }));

    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
