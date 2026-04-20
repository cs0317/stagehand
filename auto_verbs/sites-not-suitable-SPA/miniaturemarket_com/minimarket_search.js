const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { category: "strategy", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = "https://www.miniaturemarket.com/catalogsearch/result/?q=strategy";
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(8000);

    const { games } = await stagehand.extract(
      `Extract the first ${CFG.maxResults} board games from the search results. For each get the name, publisher, price, player count, and play time.`,
      z.object({
        games: z.array(z.object({
          name: z.string().describe("Game name"),
          publisher: z.string().describe("Publisher"),
          price: z.string().describe("Price"),
          player_count: z.string().describe("Player count"),
          play_time: z.string().describe("Play time"),
        })),
      })
    );

    const items = games.slice(0, CFG.maxResults).map(g => ({
      name: g.name,
      publisher: g.publisher,
      price: g.price,
      player_count: g.player_count,
      play_time: g.play_time,
    }));

    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
