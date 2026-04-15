const { Stagehand } = require("@browserbasehq/stagehand");
const { setupLLMClient } = require("../../stagehand-utils");

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", verbose: 0, llmClient,
    localBrowserLaunchOptions: { headless: false, args: ["--disable-blink-features=AutomationControlled", "--start-maximized"] }
  });
  await stagehand.init();
  const page = stagehand.context.pages()[0];
  
  // Try direct URL for search results
  await page.goto("https://www.avvo.com/search/lawyer_search?q=immigration&loc=Los+Angeles%2C+CA", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(5000);

  const bodyText = await page.evaluate(() => document.body.innerText);
  const lines = bodyText.split("\n").filter(l => l.trim()).slice(0, 100);
  console.log("Search results (first 100 lines):");
  lines.forEach((l, i) => console.log(i + ": " + l.substring(0, 200)));

  // Check selectors
  const structure = await page.evaluate(() => {
    const sels = {
      "[data-testid]": document.querySelectorAll("[data-testid]").length,
      "div[class*=lawyer]": document.querySelectorAll("div[class*='lawyer']").length,
      "div[class*=result]": document.querySelectorAll("div[class*='result']").length,
      "a[href*='/attorneys/']": document.querySelectorAll("a[href*='/attorneys/']").length,
      "div[class*=card]": document.querySelectorAll("div[class*='card']").length,
      "li": document.querySelectorAll("li").length,
    };
    const firstAttyLink = document.querySelector("a[href*='/attorneys/']");
    let parentHTML = "none";
    if (firstAttyLink) {
      let el = firstAttyLink;
      for (let i = 0; i < 4; i++) { if (el.parentElement) el = el.parentElement; }
      parentHTML = el.outerHTML.substring(0, 3000);
    }
    return { sels, parentHTML };
  });
  console.log("\nSelector counts:", JSON.stringify(structure.sels, null, 2));
  console.log("\nFirst attorney parent HTML:", structure.parentHTML.substring(0, 2000));
  console.log("\nURL:", page.url());
  await stagehand.close();
  process.exit(0);
})();
