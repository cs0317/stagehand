const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { query: "authentication", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://rubygems.org/search?query=${encodeURIComponent(CFG.query)}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(5000);

    const { gems } = await stagehand.extract(
      `Extract the first ${CFG.maxResults} gems. For each get: gem name, version, total downloads, description, and last release date.`,
      z.object({
        gems: z.array(z.object({
          name: z.string().describe("Gem name"),
          version: z.string().describe("Version"),
          downloads: z.string().describe("Total downloads"),
          description: z.string().describe("Description"),
          last_release: z.string().describe("Last release date"),
        })),
      })
    );
    const items = gems.slice(0, CFG.maxResults);
    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
