const { Stagehand } = require("@browserbasehq/stagehand");
const { setupLLMClient } = require("../../stagehand-utils");

// Last.fm – explore artist page
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
    // Go directly to Radiohead's artist page
    const url = "https://www.last.fm/music/Radiohead";
    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(5000);
    console.log(`Title: ${await page.title()}`);

    const info = await page.evaluate(() => {
      const body = document.body.innerText.substring(0, 6000);
      return { body };
    });

    console.log("\n=== Body (first 6000 chars) ===");
    console.log(info.body);

  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
