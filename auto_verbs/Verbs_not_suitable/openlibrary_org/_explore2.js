const { Stagehand } = require("@browserbasehq/stagehand");
const { setupLLMClient } = require("../../stagehand-utils");

// Open Library – try homepage first
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
    console.log("Navigating to homepage...");
    await page.goto("https://openlibrary.org", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(5000);
    const title = await page.title();
    console.log(`Title: ${title}`);

    const text = await page.evaluate(() => document.body.innerText.substring(0, 1000));
    console.log(`Body: ${text}`);

    if (title.includes("Verification") || text.includes("verify you are human")) {
      console.log("\n⚠️ CAPTCHA on homepage too - site blocks automation");
    } else {
      console.log("\n✅ Homepage loads. Trying search...");
      await page.goto("https://openlibrary.org/search?author=Isaac+Asimov&sort=editions", { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(5000);
      const title2 = await page.title();
      console.log(`Search title: ${title2}`);
      const text2 = await page.evaluate(() => document.body.innerText.substring(0, 2000));
      console.log(`Search body: ${text2}`);
    }

  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
