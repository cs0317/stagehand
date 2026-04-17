/**
 * Houzz – Home Renovation Ideas Search
 *
 * Prompt:
 *   Search for home renovation ideas matching "modern kitchen remodel".
 *   Extract up to 5 photos/projects with title, style, number of saves/likes, and description.
 *
 * Strategy:
 *   Direct URL: houzz.com/photos/query/modern-kitchen-remodel
 *   Then use Stagehand extract to pull project details.
 */

const { Stagehand } = require("@browserbasehq/stagehand");
const { z } = require("zod");
const { PlaywrightRecorder, setupLLMClient, extractAriaScopeForXPath } = require("../../stagehand-utils");

/* ── kill switch ─────────────────────────────────────────── */
const TIMEOUT = 150_000;
setTimeout(() => { console.error("\n⏰ Global timeout – exiting"); process.exit(1); }, TIMEOUT);

/* ── config ──────────────────────────────────────────────── */
const CFG = {
  query: "modern kitchen remodel",
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
    const slug = CFG.query.replace(/\s+/g, "-");
    const url = `https://www.houzz.com/photos/query/${slug}`;
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
    console.log("\n📐 DOM Exploration – photo card selectors");
    const selectors = [
      'div[class*="photo-card"]',
      'div[class*="PhotoCard"]',
      'a[href*="/photo/"]',
      'div[class*="result"]',
      'div[class*="gallery"]',
      'div[class*="image-card"]',
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
    console.log("\n🤖 Using Stagehand to extract photo/project listings...");
    const data = await stagehand.extract(
      `Extract the first ${CFG.maxItems} home renovation photos/projects from this Houzz search page. For each get: title, style, number of saves or likes, and description.`,
      z.object({
        projects: z.array(z.object({
          title: z.string(),
          style: z.string().optional(),
          saves_likes: z.string().optional(),
          description: z.string().optional(),
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
