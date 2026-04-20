const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { query: "science education", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(CFG.query)}&sp=EgIQAg%3D%3D`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(8000);

    const { channels } = await stagehand.extract(
      `Extract the first ${CFG.maxResults} YouTube channels. For each get: channel name, subscriber count, video count, and description.`,
      z.object({
        channels: z.array(z.object({
          name: z.string().describe("Channel name"),
          subscribers: z.string().describe("Subscriber count"),
          videoCount: z.string().describe("Video count"),
          description: z.string().describe("Description"),
        })),
      })
    );
    const items = channels.slice(0, CFG.maxResults);
    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
