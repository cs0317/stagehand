const { Stagehand } = require("@browserbasehq/stagehand");
const { setupLLMClient } = require("../../stagehand-utils");

(async () => {
  const llmClient = setupLLMClient("hybrid");
  const stagehand = new Stagehand({ env: "LOCAL", verbose: 0, llmClient });
  await stagehand.init();
  const page = stagehand.context.pages()[0];

  // Try simpler.grants.gov with query parameter
  await page.goto("https://simpler.grants.gov/search?query=STEM+education", {
    waitUntil: "domcontentloaded",
  });
  await new Promise(r => setTimeout(r, 8000));

  console.log("URL:", page.url());
  const text = await page.evaluate(() => document.body ? document.body.innerText : "EMPTY");
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  console.log("Lines:", lines.length);
  // Start from line 30+ to see actual results
  for (let i = 30; i < Math.min(90, lines.length); i++) {
    console.log(i + ": " + lines[i].substring(0, 180));
  }

  await stagehand.close();
})();
