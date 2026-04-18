const { Stagehand } = require("@browserbasehq/stagehand");
const { setupLLMClient } = require("../../stagehand-utils");

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", verbose: 0, llmClient,
    localBrowserLaunchOptions: { headless: false, args: ["--disable-blink-features=AutomationControlled","--start-maximized"] }
  });
  await stagehand.init();
  const page = stagehand.context.pages()[0];

  await page.goto("https://www.crunchbase.com/organization/stripe", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(10000);

  const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 4000));
  console.log("Body preview:\n", bodyText.substring(0, 2500));

  // Check for common selectors
  const selectors = ["[class*='description']", "[class*='field']", "[class*='company']",
    "[class*='identifier']", "[class*='funding']", "[class*='founded']",
    "[class*='headquarters']", "profile-section", "fields-card", "mat-card"];
  for (const sel of selectors) {
    const count = await page.evaluate((s) => document.querySelectorAll(s).length, sel);
    if (count > 0) console.log(`  ${sel}: ${count} elements`);
  }

  await stagehand.close();
  process.exit(0);
})();
