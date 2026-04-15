const { Stagehand } = require("@browserbasehq/stagehand");
const { setupLLMClient } = require("../../stagehand-utils");

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", verbose: 0, llmClient,
    localBrowserLaunchOptions: { headless: false, args: ["--disable-blink-features=AutomationControlled", "--start-maximized"] }
  });
  await stagehand.init();
  const page = stagehand.context.pages()[0];
  await page.goto("https://www.bankrate.com/banking/savings/best-high-yield-interests-savings-accounts/", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(5000);

  const bodyText = await page.evaluate(() => document.body.innerText);
  const lines = bodyText.split("\n").filter(l => l.trim()).slice(0, 100);
  console.log("Page text (first 100 lines):");
  lines.forEach((l, i) => console.log(i + ": " + l.substring(0, 200)));

  const structure = await page.evaluate(() => {
    const sels = {
      "table": document.querySelectorAll("table").length,
      "tr": document.querySelectorAll("tr").length,
      "div[data-testid]": document.querySelectorAll("div[data-testid]").length,
      "div[class*=product]": document.querySelectorAll("div[class*='product']").length,
    };
    return { sels };
  });
  console.log("\nSelector counts:", JSON.stringify(structure.sels, null, 2));
  console.log("\nURL:", page.url());
  await stagehand.close();
  process.exit(0);
})();
