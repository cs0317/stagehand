const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { query: "date formatting", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.npmjs.com/search?q=${encodeURIComponent(CFG.query)}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(5000);

    const { packages } = await stagehand.extract(
      `Extract the first ${CFG.maxResults} npm packages. For each get: package name, version, weekly downloads, description, and last publish date.`,
      z.object({
        packages: z.array(z.object({
          name: z.string().describe("Package name"),
          version: z.string().describe("Version"),
          weekly_downloads: z.string().describe("Weekly downloads count"),
          description: z.string().describe("Package description"),
          last_published: z.string().describe("Last publish date"),
        })),
      })
    );

    const items = packages.slice(0, CFG.maxResults);
    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
