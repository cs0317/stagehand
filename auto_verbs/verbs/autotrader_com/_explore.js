const { Stagehand } = require("@browserbasehq/stagehand");
const { setupLLMClient } = require("../../stagehand-utils");

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", verbose: 0, llmClient,
    localBrowserLaunchOptions: { headless: false, args: ["--disable-blink-features=AutomationControlled", "--start-maximized"] }
  });
  await stagehand.init();
  const page = stagehand.context.pages()[0];
  
  // AutoTrader URL-based search
  await page.goto("https://www.autotrader.com/cars-for-sale/used-cars/toyota/camry/chicago-il-60601?requestId=2987654321&searchRadius=50", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(5000);

  // Get text
  const bodyText = await page.evaluate(() => document.body.innerText);
  const lines = bodyText.split("\n").filter(l => l.trim()).slice(0, 100);
  console.log("Search results (first 100 lines):");
  lines.forEach((l, i) => console.log(i + ": " + l.substring(0, 200)));

  // Check structure
  const structure = await page.evaluate(() => {
    const sels = {
      "div[data-cmp=inventoryListing]": document.querySelectorAll("div[data-cmp='inventoryListing']").length,
      "div[data-testid]": document.querySelectorAll("div[data-testid]").length,
      "div[id*=listing]": document.querySelectorAll("div[id*='listing']").length,
      "a[data-cmp=listingTitle]": document.querySelectorAll("a[data-cmp='listingTitle']").length,
    };
    // Get data-cmp values
    const cmps = new Set();
    document.querySelectorAll("[data-cmp]").forEach(el => cmps.add(el.getAttribute("data-cmp")));
    
    const items = document.querySelectorAll("div[data-cmp='inventoryListing']");
    let firstHTML = "none";
    if (items.length > 0) firstHTML = items[0].outerHTML.substring(0, 3000);
    return { sels, cmps: [...cmps], firstHTML, itemCount: items.length };
  });
  console.log("\nSelector counts:", JSON.stringify(structure.sels, null, 2));
  console.log("data-cmp values:", JSON.stringify(structure.cmps));
  console.log("Item count:", structure.itemCount);
  console.log("\nFirst item HTML:", structure.firstHTML.substring(0, 2000));
  console.log("\nURL:", page.url());
  await stagehand.close();
  process.exit(0);
})();
