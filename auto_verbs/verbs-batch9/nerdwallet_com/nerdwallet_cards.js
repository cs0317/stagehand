const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");

const CFG = { maxResults: 5 };

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];
  try {
    const url = "https://www.nerdwallet.com/best/credit-cards/travel";
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    recorder.goto(url);
    await page.waitForTimeout(5000);

    const { cards } = await stagehand.extract(
      `Extract the top ${CFG.maxResults} travel reward credit cards. For each get: card name, issuer, annual fee, rewards rate, sign-up bonus, and NerdWallet rating.`,
      z.object({
        cards: z.array(z.object({
          name: z.string().describe("Card name"),
          issuer: z.string().describe("Card issuer"),
          annual_fee: z.string().describe("Annual fee"),
          rewards_rate: z.string().describe("Rewards rate"),
          signup_bonus: z.string().describe("Sign-up bonus"),
          rating: z.string().describe("NerdWallet rating"),
        })),
      })
    );

    const items = cards.slice(0, CFG.maxResults).map(c => ({
      name: c.name,
      issuer: c.issuer,
      annual_fee: c.annual_fee,
      rewards_rate: c.rewards_rate,
      signup_bonus: c.signup_bonus,
      rating: c.rating,
    }));

    recorder.record("extract", { results: items });
    console.log("Extracted:", JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
  } finally { await stagehand.close(); }
})();
