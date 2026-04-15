const { Stagehand } = require("@browserbasehq/stagehand");
const { setupLLMClient } = require("../../stagehand-utils");

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", verbose: 0, llmClient,
    localBrowserLaunchOptions: { headless: false, args: ["--disable-blink-features=AutomationControlled", "--start-maximized"] }
  });
  await stagehand.init();
  const page = stagehand.context.pages()[0];
  await page.goto("https://bandcamp.com/search?q=jazz&item_type=a", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(5000);

  const bodyText = await page.evaluate(() => document.body.innerText);
  const lines = bodyText.split("\n").filter(l => l.trim()).slice(0, 80);
  console.log("Search results (first 80 lines):");
  lines.forEach((l, i) => console.log(i + ": " + l.substring(0, 200)));

  const structure = await page.evaluate(() => {
    const sels = {
      "li.searchresult": document.querySelectorAll("li.searchresult").length,
      ".searchresult": document.querySelectorAll(".searchresult").length,
      ".result-info": document.querySelectorAll(".result-info").length,
    };
    const first = document.querySelector("li.searchresult, .searchresult");
    return { sels, firstHTML: first ? first.outerHTML.substring(0, 2000) : "none" };
  });
  console.log("\nSelector counts:", JSON.stringify(structure.sels, null, 2));
  console.log("\nFirst result HTML:", structure.firstHTML);
  console.log("\nURL:", page.url());
  await stagehand.close();
  process.exit(0);
})();
