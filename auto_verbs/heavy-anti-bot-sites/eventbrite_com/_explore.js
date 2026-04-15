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

  // Navigate to eventbrite search via URL
  await page.goto("https://www.eventbrite.com/d/ca--san-francisco/tech-meetup/", {
    waitUntil: "domcontentloaded",
  });
  await new Promise(r => setTimeout(r, 8000));

  console.log("Title:", await page.title());
  console.log("URL:", page.url());
  const text = await page.evaluate(() => document.body ? document.body.innerText : "EMPTY");
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  console.log("Lines:", lines.length);
  for (let i = 0; i < Math.min(120, lines.length); i++) {
    console.log(i + ": " + lines[i].substring(0, 160));
  }

  await stagehand.close();
})();
