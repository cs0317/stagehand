const { Stagehand } = require("@browserbasehq/stagehand");
const { setupLLMClient } = require("../../stagehand-utils");

// Glassdoor.com – explore salary page
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
    const url = "https://www.glassdoor.com/Salaries/san-francisco-software-engineer-salary-SRCH_IL.0,13_IM759_KO14,31.htm";
    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(10000);
    console.log(`Loaded: ${page.url()}`);
    console.log(`Title: ${await page.title()}`);

    const info = await page.evaluate(() => {
      const body = document.body.innerText.substring(0, 5000);
      const isBlocked = body.includes("Verify") || body.includes("captcha") ||
                        body.includes("Cloudflare") || body.includes("Access Denied") ||
                        document.title.includes("Security");
      return { body, isBlocked, title: document.title, url: window.location.href };
    });

    console.log(`\n=== Blocked? ${info.isBlocked} ===`);
    console.log("\n=== Body (first 5000 chars) ===");
    console.log(info.body);

  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
