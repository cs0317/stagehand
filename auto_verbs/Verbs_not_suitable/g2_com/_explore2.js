const { Stagehand } = require("@browserbasehq/stagehand");
const { setupLLMClient } = require("../../stagehand-utils");

// G2.com – try with longer wait + check for bot detection
(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({
    env: "LOCAL",
    verbose: 1,
    llmClient,
    localBrowserLaunchOptions: { headless: false },
  });
  await stagehand.init();
  const page = stagehand.context.pages()[0];

  try {
    const url = "https://www.g2.com/products/slack/reviews";
    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
    await page.waitForTimeout(15000);
    console.log(`Loaded: ${page.url()}`);
    console.log(`Title: ${await page.title()}`);

    const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 3000));
    console.log("\n=== Body ===");
    console.log(bodyText);

    // Check for challenge/verification page
    const html = await page.evaluate(() => document.documentElement.outerHTML.substring(0, 2000));
    console.log("\n=== HTML (first 2000) ===");
    console.log(html);

  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
