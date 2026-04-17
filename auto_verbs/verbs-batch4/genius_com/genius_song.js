/**
 * Genius – Song Lyrics Search
 *
 * Prompt:
 *   Search for the song "Bohemian Rhapsody" by Queen.
 *   Click on the top result.
 *   Extract the song title, artist name, album name, and the first verse of the lyrics.
 *
 * Strategy:
 *   Direct URL: genius.com/search?q=<query>
 *   Click top result, then extract song details.
 */

const { Stagehand } = require("@browserbasehq/stagehand");
const { z } = require("zod");
const { PlaywrightRecorder, setupLLMClient, extractAriaScopeForXPath } = require("../../stagehand-utils");

/* ── kill switch ─────────────────────────────────────────── */
const TIMEOUT = 150_000;
setTimeout(() => { console.error("\n⏰ Global timeout – exiting"); process.exit(1); }, TIMEOUT);

/* ── config ──────────────────────────────────────────────── */
const CFG = {
  query: "Bohemian Rhapsody Queen",
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
    // ── Navigate to Genius search ───────────────────────────
    const url = `https://genius.com/search?q=${encodeURIComponent(CFG.query)}`;
    console.log(`🌐 Navigating to: ${url}`);
    recorder.record("navigate", { url });
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(5000);
    console.log(`   ✅ Loaded: ${page.url()}`);

    // ── Check for bot detection ──────────────────────────────
    const bodyText = await page.evaluate(() => document.body?.innerText || "");
    if (bodyText.includes("CAPTCHA") || bodyText.includes("Access Denied") || bodyText.includes("Cloudflare") || bodyText.includes("Just a moment")) {
      console.error("🚫 Bot detection triggered!");
      console.log("Body preview:", bodyText.substring(0, 500));
      return;
    }
    console.log(`   Body length: ${bodyText.length} chars`);

    // ── DOM Exploration on search results page ──────────────
    console.log("\n📐 DOM Exploration – search result selectors");
    const selectors = [
      'a[href*="/lyrics"]',
      'a[class*="search_result"]',
      'div[class*="search_result"]',
      'mini-song-card',
      'search-result-item',
    ];
    for (const sel of selectors) {
      const count = await page.locator(sel).count();
      console.log(`   ${sel} → ${count}`);
    }

    // ── Click top result ────────────────────────────────────
    console.log("\n🖱️ Clicking top search result...");
    await stagehand.act("Click the first song result for Bohemian Rhapsody");
    await page.waitForTimeout(5000);
    console.log(`   ✅ Navigated to: ${page.url()}`);

    // ── DOM Exploration on song page ────────────────────────
    console.log("\n📐 DOM Exploration – song page selectors");
    const songSelectors = [
      'div[class*="lyrics"]',
      'div[class*="Lyrics"]',
      'div[data-lyrics-container]',
      'span[class*="lyrics"]',
      'h1',
      'a[class*="Artist"]',
      'div[class*="album"]',
    ];
    for (const sel of songSelectors) {
      const count = await page.locator(sel).count();
      console.log(`   ${sel} → ${count}`);
    }

    // ── Explore accessible tree ─────────────────────────────
    console.log("\n🌲 Accessible tree (first 3000 chars):");
    const ariaTree = await extractAriaScopeForXPath(page, "/html/body", 3000);
    console.log(ariaTree);

    // ── Stagehand extract ───────────────────────────────────
    console.log("\n🤖 Using Stagehand to extract song details...");
    const data = await stagehand.extract(
      "Extract the song title, artist name, album name, and the first verse (first paragraph) of the lyrics from this Genius song page.",
      z.object({
        song_title: z.string(),
        artist_name: z.string(),
        album_name: z.string().optional(),
        first_verse: z.string(),
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
