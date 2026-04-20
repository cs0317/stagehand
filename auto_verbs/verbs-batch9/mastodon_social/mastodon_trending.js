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
    const url = "https://mastodon.social/explore";
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(5000);

    const { posts } = await stagehand.extract(
      `Extract the first ${CFG.maxResults} trending posts. For each get the author name/handle, content (first 200 characters), boost count, and favorite count.`,
      z.object({
        posts: z.array(z.object({
          author: z.string().describe("Author name or handle"),
          content: z.string().describe("Post content, first 200 characters"),
          boosts: z.string().describe("Boost/reblog count"),
          favorites: z.string().describe("Favorite/like count"),
        })),
      })
    );

    const items = posts.slice(0, CFG.maxResults).map(p => ({
      author: p.author,
      content: p.content.substring(0, 200),
      boosts: p.boosts,
      favorites: p.favorites,
    }));

    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
