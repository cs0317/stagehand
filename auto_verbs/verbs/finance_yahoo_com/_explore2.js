const { Stagehand } = require("@browserbasehq/stagehand");
const { setupLLMClient } = require("../../stagehand-utils");

(async () => {
  const llmClient = setupLLMClient("hybrid");
  const stagehand = new Stagehand({
    env: "LOCAL",
    verbose: 0,
    llmClient,
  });
  await stagehand.init();
  const page = stagehand.context.pages()[0];

  await page.goto("https://finance.yahoo.com/quote/AAPL/", {
    waitUntil: "domcontentloaded",
  });
  await new Promise(r => setTimeout(r, 8000));

  const text = await page.evaluate(() => document.body ? document.body.innerText : "EMPTY");
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  // Print lines 90-160 to find Volume and Market Cap
  for (let i = 90; i < Math.min(160, lines.length); i++) {
    console.log(i + ": " + lines[i].substring(0, 160));
  }

  await stagehand.close();
})();
