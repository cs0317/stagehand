const { Stagehand } = require("@browserbasehq/stagehand");
const { setupLLMClient } = require("../../stagehand-utils");

// Open Library – explore search results page
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
    const url = "https://openlibrary.org/search?author=Isaac+Asimov";
    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(5000);
    console.log(`Title: ${await page.title()}`);

    const info = await page.evaluate(() => {
      return document.body.innerText.substring(0, 4000);
    });
    console.log("\n=== Body (first 4000 chars) ===");
    console.log(info);

    // Get card structure
    const cards = await page.evaluate(() => {
      const items = document.querySelectorAll("li.searchResultItem, li[class*='search'], .SRPSearchResult, [class*='bookresult']");
      if (items.length === 0) {
        // Fallback: look for any list items in main area
        const mainLis = document.querySelectorAll(".results li, #searchResults li");
        return { selector: "fallback", count: mainLis.length, sample: mainLis[0]?.innerText?.substring(0, 300) || "" };
      }
      return { selector: items[0].className, count: items.length, sample: items[0].innerText.substring(0, 300) };
    });
    console.log("\n=== Card structure ===");
    console.log(JSON.stringify(cards, null, 2));

  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
