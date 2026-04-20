const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { query: "photography", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.reddit.com/search/?q=${encodeURIComponent(CFG.query)}&type=sr`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(8000);

    const { subreddits } = await stagehand.extract(
      `Extract the first ${CFG.maxResults} subreddit communities. For each get: name, member count, description, and online count.`,
      z.object({
        subreddits: z.array(z.object({
          name: z.string().describe("Subreddit name"),
          members: z.string().describe("Member count"),
          description: z.string().describe("Description"),
          online: z.string().describe("Online count"),
        })),
      })
    );
    const items = subreddits.slice(0, CFG.maxResults);
    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
