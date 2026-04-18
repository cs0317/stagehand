const { Stagehand } = require("@browserbasehq/stagehand");
const { setupLLMClient } = require("../../stagehand-utils");

// G2.com – explore Slack review page
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
    // G2 product review pages are at /products/{slug}/reviews
    const url = "https://www.g2.com/products/slack/reviews";
    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(8000);
    console.log(`Loaded: ${page.url()}`);

    const info = await page.evaluate(() => {
      const body = document.body.innerText.substring(0, 5000);
      // Check for bot detection
      const isBlocked = body.includes("Verify") && body.includes("human") ||
                        body.includes("Cloudflare") || body.includes("captcha") ||
                        body.includes("Access Denied") || body.includes("blocked");
      // Look for review elements
      const selectors = [
        ".review-card", "[itemprop='review']", ".paper--box", ".paper",
        ".review", "div[id^='review-']", ".review-content",
        "[data-test-id='review-card']"
      ];
      let found = {};
      for (const sel of selectors) {
        const els = document.querySelectorAll(sel);
        if (els.length > 0) {
          found[sel] = {
            count: els.length,
            samples: [...els].slice(0, 2).map(e => ({
              tag: e.tagName, cls: e.className,
              text: e.innerText.substring(0, 400),
            }))
          };
        }
      }
      // Overall rating
      const ratingEl = document.querySelector("[itemprop='ratingValue'], .stars-wrapper, .rating");
      return {
        title: document.title, body, isBlocked, found,
        rating: ratingEl ? ratingEl.textContent.trim() : null,
        url: window.location.href
      };
    });

    console.log("\n=== Title ===");
    console.log(info.title);
    console.log(`\n=== Blocked? ${info.isBlocked} ===`);
    console.log(`\n=== URL: ${info.url} ===`);
    console.log("\n=== Body (first 5000 chars) ===");
    console.log(info.body);
    console.log("\n=== Rating ===");
    console.log(info.rating);
    console.log("\n=== Found selectors ===");
    for (const [sel, data] of Object.entries(info.found)) {
      console.log(`\n  ${sel} (${data.count} items):`);
      data.samples.forEach((s, i) => console.log(`    ${i}: text="${s.text.substring(0, 300)}"`));
    }

  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
