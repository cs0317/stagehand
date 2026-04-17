/**
 * GasBuddy – Gas Price Search
 *
 * Prompt:
 *   Search for gas prices near "Denver, CO".
 *   Extract up to 5 gas stations with station name, address, regular gas price, and last updated time.
 *
 * Strategy:
 *   Direct URL: gasbuddy.com/home?search=<query>&fuel=1
 *   Then use Stagehand extract to pull station details.
 */

const { Stagehand } = require("@browserbasehq/stagehand");
const { z } = require("zod");
const { PlaywrightRecorder, setupLLMClient, extractAriaScopeForXPath } = require("../../stagehand-utils");

/* ── kill switch ─────────────────────────────────────────── */
const TIMEOUT = 150_000;
setTimeout(() => { console.error("\n⏰ Global timeout – exiting"); process.exit(1); }, TIMEOUT);

/* ── config ──────────────────────────────────────────────── */
const CFG = {
  query: "Denver, CO",
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
    // ── Navigate to GasBuddy search ─────────────────────────
    const url = `https://www.gasbuddy.com/home?search=${encodeURIComponent(CFG.query)}&fuel=1`;
    console.log(`🌐 Navigating to: ${url}`);
    recorder.record("navigate", { url });
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(6000);
    console.log(`   ✅ Loaded: ${page.url()}`);

    // ── Check for bot detection ──────────────────────────────
    const bodyText = await page.evaluate(() => document.body?.innerText || "");
    if (bodyText.includes("CAPTCHA") || bodyText.includes("Access Denied") || bodyText.includes("Cloudflare") || bodyText.includes("Just a moment")) {
      console.error("🚫 Bot detection triggered!");
      console.log("Body preview:", bodyText.substring(0, 500));
      return;
    }
    console.log(`   Body length: ${bodyText.length} chars`);

    // ── DOM Exploration ──────────────────────────────────────
    console.log("\n📐 DOM Exploration – gas station card selectors");

    const selectors = [
      'div[class*="GenericStationListItem"]',
      'div[class*="station"]',
      'a[href*="/station/"]',
      'div[class*="StationDisplay"]',
      'div[class*="price"]',
      'div[class*="GasStation"]',
      'li[class*="station"]',
    ];

    for (const sel of selectors) {
      const count = await page.locator(sel).count();
      console.log(`   ${sel} → ${count}`);
    }

    // ── Explore accessible tree ─────────────────────────────
    console.log("\n🌲 Accessible tree (first 3000 chars):");
    const ariaTree = await extractAriaScopeForXPath(page, "/html/body", 3000);
    console.log(ariaTree);

    // ── Check station links ─────────────────────────────────
    console.log("\n📋 Station links in the DOM:");
    const stationLinks = await page.evaluate(() => {
      const links = document.querySelectorAll('a[href*="/station/"]');
      const results = [];
      for (let i = 0; i < Math.min(5, links.length); i++) {
        const el = links[i];
        results.push({
          href: el.href,
          text: (el.innerText || "").substring(0, 200),
          parentText: (el.parentElement?.innerText || "").substring(0, 300),
        });
      }
      return results;
    });
    console.log(JSON.stringify(stationLinks, null, 2));

    // ── Stagehand extract ───────────────────────────────────
    console.log("\n🤖 Using Stagehand to extract gas station listings...");
    const data = await stagehand.extract(
      `Extract the first ${CFG.maxItems} gas stations from this GasBuddy search results page. For each station get: station name, address, regular gas price, and last updated time.`,
      z.object({
        stations: z.array(z.object({
          station_name: z.string(),
          address: z.string(),
          regular_price: z.string(),
          last_updated: z.string().optional(),
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
