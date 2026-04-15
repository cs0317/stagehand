const { Stagehand } = require("@browserbasehq/stagehand");
const { setupLLMClient } = require("../../stagehand-utils");

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", verbose: 0, llmClient,
    localBrowserLaunchOptions: { headless: false, args: ["--disable-blink-features=AutomationControlled", "--start-maximized"] }
  });
  await stagehand.init();
  const page = stagehand.context.pages()[0];
  await page.goto("https://www.audible.com/search?keywords=science+fiction", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(5000);

  // Get page text
  const bodyText = await page.evaluate(() => document.body.innerText);
  const lines = bodyText.split("\n").filter(l => l.trim()).slice(0, 100);
  console.log("Search results (first 100 lines):");
  lines.forEach((l, i) => console.log(i + ": " + l.substring(0, 200)));

  // Check product card structure
  const structure = await page.evaluate(() => {
    const sels = {
      "li.productListItem": document.querySelectorAll("li.productListItem").length,
      "li[class*=product]": document.querySelectorAll("li[class*=product]").length,
      "div[class*=product]": document.querySelectorAll("div[class*=product]").length,
      "h3": document.querySelectorAll("h3").length,
      "h3 a": document.querySelectorAll("h3 a").length,
    };
    // Get first product card
    const items = document.querySelectorAll("li.productListItem, li[class*=product]");
    let firstHTML = "none";
    if (items.length > 0) {
      firstHTML = items[0].outerHTML.substring(0, 3000);
    }
    return { sels, firstHTML, itemCount: items.length };
  });
  console.log("\nSelector counts:", JSON.stringify(structure.sels, null, 2));
  console.log("Item count:", structure.itemCount);
  console.log("\nFirst item HTML:", structure.firstHTML.substring(0, 2000));
  console.log("\nURL:", page.url());
  await stagehand.close();
  process.exit(0);
})();
