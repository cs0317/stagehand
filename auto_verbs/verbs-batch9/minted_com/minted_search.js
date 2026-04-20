const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { query: "modern minimalist wedding invitations", maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = `https://www.minted.com/wedding-invitations?search=${encodeURIComponent(CFG.query)}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(5000);

    const { designs } = await stagehand.extract(
      `Extract the first ${CFG.maxResults} wedding invitation designs. For each get the design name, artist name, price, and number of color options.`,
      z.object({
        designs: z.array(z.object({
          name: z.string().describe("Design name"),
          artist: z.string().describe("Artist name"),
          price: z.string().describe("Price"),
          color_options: z.string().describe("Number of color options"),
        })),
      })
    );

    const items = designs.slice(0, CFG.maxResults).map(d => ({
      name: d.name,
      artist: d.artist,
      price: d.price,
      color_options: d.color_options,
    }));

    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
