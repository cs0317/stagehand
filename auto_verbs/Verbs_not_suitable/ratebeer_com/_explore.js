const { Stagehand } = require("@browserbasehq/stagehand");
const { setupLLMClient } = require("../../stagehand-utils");

// RateBeer – explore search results
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
    const url = "https://www.ratebeer.com/search?q=IPA";
    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(5000);
    console.log(`Title: ${await page.title()}`);
    console.log(`URL: ${page.url()}`);

    const info = await page.evaluate(() => {
      return document.body.innerText.substring(0, 5000);
    });
    console.log("\n=== Body (first 5000 chars) ===");
    console.log(info);

  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
