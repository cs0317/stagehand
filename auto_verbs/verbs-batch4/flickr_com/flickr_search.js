/**
 * Flickr – Photo Search
 *
 * Prompt:
 *   Search for photos matching "northern lights".
 *   Extract up to 5 photos with title, photographer username, number of views, and number of faves.
 *
 * Strategy:
 *   Direct URL: flickr.com/search/?text=<query>
 *   Then use Stagehand extract to pull photo details.
 */

const { Stagehand } = require("@browserbasehq/stagehand");
const { z } = require("zod");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { PlaywrightRecorder, setupLLMClient, extractAriaScopeForXPath } = require("../../stagehand-utils");

/* ── kill switch ─────────────────────────────────────────── */
const TIMEOUT = 150_000;
setTimeout(() => { console.error("\n⏰ Global timeout – exiting"); process.exit(1); }, TIMEOUT);

/* ── config ──────────────────────────────────────────────── */
const CFG = {
  query: "northern lights",
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
    // ── Navigate to Flickr search ──────────────────────────
    const url = `https://www.flickr.com/search/?text=${encodeURIComponent(CFG.query)}`;
    console.log(`🌐 Navigating to: ${url}`);
    recorder.record("navigate", { url });
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(6000);
    console.log(`   ✅ Loaded: ${page.url()}`);

    // ── Check for bot detection ──────────────────────────────
    const bodyText = await page.evaluate(() => document.body?.innerText || "");
    if (bodyText.includes("CAPTCHA") || bodyText.includes("Access Denied") || bodyText.includes("Cloudflare")) {
      console.error("🚫 Bot detection triggered!");
      console.log("Body preview:", bodyText.substring(0, 500));
      return;
    }
    console.log(`   Body length: ${bodyText.length} chars`);

    // ── DOM Exploration ──────────────────────────────────────
    console.log("\n📐 DOM Exploration – photo card selectors");

    const selectors = [
      'div.photo-list-photo-view',
      'div[class*="photo-list-photo"]',
      'a[data-track="photo-click"]',
      'div.overlay',
      'div[class*="photo-list-photo-container"]',
      'div[style*="background-image"]',
      'div.view',
    ];

    for (const sel of selectors) {
      const count = await page.locator(sel).count();
      console.log(`   ${sel} → ${count}`);
    }

    // ── Explore accessible tree for photo cards ─────────────
    console.log("\n🌲 Accessible tree (first 3000 chars):");
    const ariaTree = await extractAriaScopeForXPath(page, "/html/body", 3000);
    console.log(ariaTree);

    // ── Try to find any substantial elements ────────────────
    console.log("\n📋 Checking for photo titles in the DOM...");
    const titleElements = await page.evaluate(() => {
      const results = [];
      // Check if there are photo overlay elements
      const overlays = document.querySelectorAll('.overlay, .photo-list-photo-interaction, [class*="photo-list"]');
      for (let i = 0; i < Math.min(5, overlays.length); i++) {
        const el = overlays[i];
        results.push({
          tag: el.tagName,
          className: el.className.substring(0, 100),
          text: (el.innerText || "").substring(0, 200),
          childCount: el.children.length,
        });
      }
      return results;
    });
    console.log("Title elements:", JSON.stringify(titleElements, null, 2));

    // ── Stagehand extract ───────────────────────────────────
    console.log("\n🤖 Using Stagehand to extract photo listings...");
    const data = await stagehand.extract(
      `Extract the first ${CFG.maxItems} photo listings from this Flickr search results page. For each photo get: title, photographer username, number of views (if visible), and number of faves (if visible).`,
      z.object({
        photos: z.array(z.object({
          title: z.string(),
          photographer: z.string(),
          views: z.string().optional(),
          faves: z.string().optional(),
        })),
      }),
    );

    console.log("\n📊 Extracted data:");
    console.log(JSON.stringify(data, null, 2));

    // ── Hover over a photo to see overlay info ──────────────
    console.log("\n🖱️ Attempting to hover over first photo to reveal overlay...");
    const photoCards = page.locator('div.photo-list-photo-view, div[class*="photo-list-photo-container"]');
    const cardCount = await photoCards.count();
    if (cardCount > 0) {
      await photoCards.first().hover();
      await page.waitForTimeout(2000);
      
      const overlayText = await page.evaluate(() => {
        const overlays = document.querySelectorAll('.overlay, .photo-list-photo-interaction, [class*="engagement"]');
        const results = [];
        for (let i = 0; i < Math.min(3, overlays.length); i++) {
          results.push((overlays[i].innerText || "").substring(0, 200));
        }
        return results;
      });
      console.log("Overlay text after hover:", JSON.stringify(overlayText, null, 2));
    }

  } catch (err) {
    console.error("❌ Error:", err.message);
  } finally {
    await stagehand.close();
    console.log("\n✅ Done");
  }
})();
