const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { format: "standard", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.mtggoldfish.com/metagame/${CFG.format}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(5000);

    const { decks } = await stagehand.extract(
      `Extract the top ${CFG.maxResults} Standard format decks. For each get: deck name, colors (mana colors), meta share percentage, and average price.`,
      z.object({
        decks: z.array(z.object({
          name: z.string().describe("Deck name"),
          colors: z.string().describe("Mana colors"),
          meta_share: z.string().describe("Meta share percentage"),
          price: z.string().describe("Average price"),
        })),
      })
    );

    const items = decks.slice(0, CFG.maxResults).map(d => ({
      name: d.name,
      colors: d.colors,
      meta_share: d.meta_share,
      price: d.price,
    }));

    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
