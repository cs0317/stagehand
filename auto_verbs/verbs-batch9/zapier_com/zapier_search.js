const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { query: "Google Sheets", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://zapier.com/apps/google-sheets/integrations`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(8000);

    const { zaps } = await stagehand.extract(
      `Extract the first ${CFG.maxResults} popular Zaps/integrations. For each get: Zap name, connected apps, number of users, and description.`,
      z.object({
        zaps: z.array(z.object({
          name: z.string().describe("Zap name"),
          apps: z.string().describe("Connected apps"),
          users: z.string().describe("Number of users"),
          description: z.string().describe("Description"),
        })),
      })
    );
    const items = zaps.slice(0, CFG.maxResults);
    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
