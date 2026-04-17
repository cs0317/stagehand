/**
 * IGN – Game Review Search
 *
 * Prompt:
 *   Search for game reviews matching "Zelda".
 *   Extract up to 5 reviews with game title, platform, review score, and review summary.
 */

const { Stagehand } = require("@browserbasehq/stagehand");
const { z } = require("zod");
const { PlaywrightRecorder, setupLLMClient, extractAriaScopeForXPath } = require("../../stagehand-utils");

const TIMEOUT = 150_000;
setTimeout(() => { console.error("\n⏰ Global timeout – exiting"); process.exit(1); }, TIMEOUT);

const CFG = { query: "Zelda", maxItems: 5 };

(async () => {
  const llmClient = setupLLMClient("copilot");
  const stagehand = new Stagehand({
    env: "LOCAL", verbose: 1, llmClient,
    localBrowserLaunchOptions: { headless: false, channel: "chrome", args: ["--disable-blink-features=AutomationControlled"] },
  });
  await stagehand.init();
  const page = stagehand.context.pages()[0];

  try {
    const url = `https://www.ign.com/search?q=${encodeURIComponent(CFG.query)}`;
    console.log(`🌐 Navigating to: ${url}`);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(6000);
    console.log(`   ✅ Loaded: ${page.url()}`);

    const bodyText = await page.evaluate(() => document.body?.innerText || "");
    if (bodyText.includes("CAPTCHA") || bodyText.includes("Cloudflare") || bodyText.includes("Just a moment") || bodyText.includes("Error 404")) {
      // Fallback: try navigating via homepage search
      console.log("   ⚠️ Direct search URL failed, trying homepage search...");
      await page.goto("https://www.ign.com", { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(3000);
      await stagehand.act("Click the search icon or search button");
      await page.waitForTimeout(2000);
      await stagehand.act(`Type "${CFG.query}" into the search field and press Enter`);
      await page.waitForTimeout(5000);
      console.log(`   ✅ After search: ${page.url()}`);
    }
    console.log(`   Body length: ${bodyText.length} chars`);

    // DOM Exploration
    console.log("\n📐 DOM Exploration – review card selectors");
    for (const sel of ['div[class*="search-result"]', 'a[href*="/articles/"]', 'div[class*="item"]', 'span[class*="score"]']) {
      const count = await page.locator(sel).count();
      console.log(`   ${sel} → ${count}`);
    }

    console.log("\n🌲 Accessible tree (first 3000 chars):");
    const ariaTree = await extractAriaScopeForXPath(page, "/html/body", 3000);
    console.log(ariaTree);

    console.log("\n🤖 Extracting review listings...");
    const data = await stagehand.extract(
      `Extract the first ${CFG.maxItems} game reviews from this IGN search results page. For each get: game title, platform, review score (out of 10), and review summary.`,
      z.object({
        reviews: z.array(z.object({
          game_title: z.string(),
          platform: z.string().optional(),
          score: z.string(),
          summary: z.string().optional(),
        })),
      }),
    );
    console.log("\n📊 Extracted data:");
    console.log(JSON.stringify(data, null, 2));

  } catch (err) { console.error("❌ Error:", err.message); }
  finally { await stagehand.close(); console.log("\n✅ Done"); }
})();
