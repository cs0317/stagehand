const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { query: "Japan travel tips", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.tripadvisor.com/Search?q=${encodeURIComponent(CFG.query)}&searchSessionId=&sid=&blockRedirect=true&ssrc=e&isSingleSearch=true&geo=&rf=`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(5000);

    await stagehand.act(`Click on "Forums" tab or filter to show forum results`);
    await page.waitForTimeout(5000);

    const { posts } = await stagehand.extract(
      `Extract the first ${CFG.maxResults} forum posts. For each get: title, forum name, author, reply count, and last reply date.`,
      z.object({
        posts: z.array(z.object({
          title: z.string().describe("Post title"),
          forum: z.string().describe("Forum name"),
          author: z.string().describe("Author"),
          replies: z.string().describe("Reply count"),
          last_reply: z.string().describe("Last reply date"),
        })),
      })
    );
    const items = posts.slice(0, CFG.maxResults);
    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
