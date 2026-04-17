/**
 * GoodRx – Prescription Drug Price Search
 *
 * Prompt:
 *   Search for the prescription drug "metformin".
 *   Extract the drug name, typical dosage shown, and up to 5 pharmacy prices with pharmacy name and price.
 *
 * Strategy:
 *   Direct URL: goodrx.com/metformin
 *   Then use Stagehand extract to pull drug and pharmacy details.
 */

const { Stagehand } = require("@browserbasehq/stagehand");
const { z } = require("zod");
const { PlaywrightRecorder, setupLLMClient, extractAriaScopeForXPath } = require("../../stagehand-utils");

/* ── kill switch ─────────────────────────────────────────── */
const TIMEOUT = 150_000;
setTimeout(() => { console.error("\n⏰ Global timeout – exiting"); process.exit(1); }, TIMEOUT);

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
    // ── Navigate to GoodRx drug page ────────────────────────
    const url = "https://www.goodrx.com/metformin";
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
    console.log("\n📐 DOM Exploration – pharmacy price selectors");
    const selectors = [
      'div[class*="PharmacyCard"]',
      'div[class*="pharmacy"]',
      'a[href*="pharmacy"]',
      'div[class*="price"]',
      'span[class*="price"]',
      'div[class*="PriceRow"]',
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
    console.log("\n🤖 Using Stagehand to extract drug pricing...");
    const data = await stagehand.extract(
      "Extract the drug name, typical dosage shown, and up to 5 pharmacy prices. For each pharmacy get: pharmacy name and price.",
      z.object({
        drug_name: z.string(),
        dosage: z.string(),
        pharmacy_prices: z.array(z.object({
          pharmacy_name: z.string(),
          price: z.string(),
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
