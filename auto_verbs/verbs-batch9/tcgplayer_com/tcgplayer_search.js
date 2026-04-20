const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { query: "Charizard", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.tcgplayer.com/search/pokemon/product?q=${encodeURIComponent(CFG.query)}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(8000);

    const { cards } = await stagehand.extract(
      `Extract the first ${CFG.maxResults} card listings. For each get: card name, set, condition, price, and seller.`,
      z.object({
        cards: z.array(z.object({
          name: z.string().describe("Card name"),
          set: z.string().describe("Set name"),
          condition: z.string().describe("Condition"),
          price: z.string().describe("Price"),
          seller: z.string().describe("Seller"),
        })),
      })
    );
    const items = cards.slice(0, CFG.maxResults);
    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
