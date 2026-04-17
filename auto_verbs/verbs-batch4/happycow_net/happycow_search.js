/**
 * HappyCow – Vegan/Vegetarian Restaurant Search
 *
 * Prompt:
 *   Search for vegan and vegetarian restaurants in "Portland, OR".
 *   Extract up to 5 restaurants with name, cuisine type, rating, address, price range.
 *
 * Strategy:
 *   Direct URL: happycow.net/searchmap?s=3&location=Portland,+OR
 *   Then use Stagehand extract to pull restaurant details.
 */

const { Stagehand } = require("@browserbasehq/stagehand");
const { z } = require("zod");
const { PlaywrightRecorder, setupLLMClient, extractAriaScopeForXPath } = require("../../stagehand-utils");

/* ── kill switch ─────────────────────────────────────────── */
const TIMEOUT = 150_000;
setTimeout(() => { console.error("\n⏰ Global timeout – exiting"); process.exit(1); }, TIMEOUT);

/* ── config ──────────────────────────────────────────────── */
const CFG = {
  location: "Portland, OR",
  maxItems: 5,
};

/* ── main ────────────────────────────────────────────────── */
(async () => {
  const llmClient = setupLLMClient("copilot");

  const stagehand = new Stagehand({
    env: "LOCAL",
    verbose: 1,
    llmClient,
    localBrowserLaunchOptions: {
      headless: false,
      channel: "chrome",
      args: ["--disable-blink-features=AutomationControlled"],
    },
  });
  await stagehand.init();

  const page = stagehand.context.pages()[0];
  const recorder = new PlaywrightRecorder();

  try {
    // ── Navigate to HappyCow search ─────────────────────────
    const url = `https://www.happycow.net/searchmap?s=3&location=${encodeURIComponent(CFG.location)}`;
    console.log(`🌐 Navigating to: ${url}`);
    recorder.record("navigate", { url });
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(6000);
    console.log(`   ✅ Loaded: ${page.url()}`);

    // ── Check for bot detection ─────────────────────────────
    const bodyText = await page.evaluate(() => document.body?.innerText || "");
    if (bodyText.includes("CAPTCHA") || bodyText.includes("Access Denied") || bodyText.includes("Cloudflare") || bodyText.includes("Just a moment")) {
      console.error("🚫 Bot detection triggered!");
      console.log("Body preview:", bodyText.substring(0, 500));
      return;
    }
    console.log(`   Body length: ${bodyText.length} chars`);

    // ── DOM Exploration ─────────────────────────────────────
    console.log("\n📐 DOM Exploration – restaurant card selectors");
    const selectors = [
      'div[class*="restaurant"]',
      'div[class*="venue"]',
      'a[href*="/reviews/"]',
      'div[class*="SearchResult"]',
      'div[class*="listing"]',
      'div[class*="card"]',
    ];
    for (const sel of selectors) {
      const count = await page.locator(sel).count();
      console.log(`   ${sel} → ${count}`);
    }

    // ── Explore accessible tree ─────────────────────────────
    console.log("\n🌲 Accessible tree (first 3000 chars):");
    const ariaTree = await extractAriaScopeForXPath(page, "/html/body", 3000);
    console.log(ariaTree);

    // ── Stagehand extract ───────────────────────────────────
    console.log("\n🤖 Using Stagehand to extract restaurant listings...");
    const data = await stagehand.extract(
      `Extract the first ${CFG.maxItems} vegan/vegetarian restaurants from this HappyCow search results page. For each get: restaurant name, cuisine type (vegan/vegetarian/veg-friendly), rating, address, and price range.`,
      z.object({
        restaurants: z.array(z.object({
          name: z.string(),
          cuisine_type: z.string(),
          rating: z.string().optional(),
          address: z.string().optional(),
          price_range: z.string().optional(),
        })),
      }),
    );

    console.log("\n📊 Extracted data:");
    console.log(JSON.stringify(data, null, 2));

  } catch (err) {
    console.error("❌ Error:", err.message);
  } finally {
    await stagehand.close();
    console.log("\n✅ Done");
  }
})();
