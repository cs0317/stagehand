const { Stagehand } = require("@browserbasehq/stagehand");
const { setupLLMClient } = require("../../stagehand-utils");

(async () => {
  const llmClient = setupLLMClient("hybrid");
  const stagehand = new Stagehand({ env: "LOCAL", verbose: 0, llmClient });
  await stagehand.init();
  const page = stagehand.context.pages()[0];

  await page.goto("https://www.grants.gov/search-grants?cfda=&closing=&eligibilities=&fundingCategories=&fundingInstruments=&keyword=STEM+education&matchField=all&matchMode=exact&numberOfOpportunities=25&oppStatuses=forecasted%7Cposted&sortBy=openDate%7Cdesc", {
    waitUntil: "domcontentloaded",
  });
  await new Promise(r => setTimeout(r, 8000));

  console.log("Title:", await page.title());
  console.log("URL:", page.url());
  const text = await page.evaluate(() => document.body ? document.body.innerText : "EMPTY");
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  console.log("Lines:", lines.length);
  for (let i = 0; i < Math.min(120, lines.length); i++) {
    console.log(i + ": " + lines[i].substring(0, 180));
  }

  await stagehand.close();
})();
