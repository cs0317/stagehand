const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = "https://www.producthunt.com/";
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(8000);

    const { products } = await stagehand.extract(
      `Extract the top 5 product launches shown today. For each get: product name, tagline, upvote count, comment count, and maker name.`,
      z.object({
        products: z.array(z.object({
          name: z.string().describe("Product name"),
          tagline: z.string().describe("Product tagline"),
          upvotes: z.string().describe("Upvote count"),
          comments: z.string().describe("Comment count"),
          maker: z.string().describe("Maker name"),
        })),
      })
    );

    const items = products.slice(0, 5);
    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
