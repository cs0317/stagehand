/**
 * _explore.js – CoinMarketCap DOM explorer
 * Run: node verbs/coinmarketcap_com/_explore.js
 */
const { Stagehand } = require("@browserbasehq/stagehand");
const { setupLLMClient } = require("../../stagehand-utils");

(async () => {
  const llmClient = setupLLMClient("hybrid");
  const stagehand = new Stagehand({ env: "LOCAL", verbose: 0, llmClient });
  await stagehand.init();
  const page = stagehand.context.pages()[0];

  await page.goto("https://coinmarketcap.com/currencies/bitcoin/");
  await page.waitForLoadState("domcontentloaded");
  await new Promise(r => setTimeout(r, 5000));
  console.log("URL:", page.url());

  const text = await page.evaluate(() => document.body.innerText);
  const lines = text.split("\n").filter(l => l.trim());
  console.log("Text lines:", lines.length);
  lines.slice(0, 80).forEach((l, i) => console.log("[" + i + "] " + l.substring(0, 140)));

  await stagehand.close();
})();
