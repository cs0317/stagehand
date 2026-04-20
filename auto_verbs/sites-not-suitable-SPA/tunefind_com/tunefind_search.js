const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { show: "Stranger Things", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.tunefind.com/show/stranger-things`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(5000);

    const { songs } = await stagehand.extract(
      `Extract the first ${CFG.maxResults} songs featured in this show. For each get: song title, artist, season/episode it appeared in, and scene description.`,
      z.object({
        songs: z.array(z.object({
          title: z.string().describe("Song title"),
          artist: z.string().describe("Artist"),
          episode: z.string().describe("Season/episode"),
          scene: z.string().describe("Scene description"),
        })),
      })
    );
    const items = songs.slice(0, CFG.maxResults);
    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
