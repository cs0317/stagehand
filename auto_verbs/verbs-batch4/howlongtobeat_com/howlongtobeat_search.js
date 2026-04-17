/**
 * HowLongToBeat – Game Completion Time Search
 *
 * Prompt:
 *   Search for the game "Elden Ring".
 *   Extract the game title, main story time, main + extras time, and completionist time.
 */

const { Stagehand } = require("@browserbasehq/stagehand");
const { z } = require("zod");
const { PlaywrightRecorder, setupLLMClient, extractAriaScopeForXPath } = require("../../stagehand-utils");

const TIMEOUT = 150_000;
setTimeout(() => { console.error("\n⏰ Global timeout – exiting"); process.exit(1); }, TIMEOUT);

const CFG = { query: "Elden Ring" };

(async () => {
  const llmClient = setupLLMClient("copilot");
  const stagehand = new Stagehand({
    env: "LOCAL", verbose: 1, llmClient,
    localBrowserLaunchOptions: { headless: false, channel: "chrome", args: ["--disable-blink-features=AutomationControlled"] },
  });
  await stagehand.init();
  const page = stagehand.context.pages()[0];

  try {
    const url = `https://howlongtobeat.com/?q=${encodeURIComponent(CFG.query)}`;
    console.log(`🌐 Navigating to: ${url}`);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(5000);
    console.log(`   ✅ Loaded: ${page.url()}`);

    const bodyText = await page.evaluate(() => document.body?.innerText || "");
    if (bodyText.includes("CAPTCHA") || bodyText.includes("Cloudflare") || bodyText.includes("Just a moment")) {
      console.error("🚫 Bot detection!"); console.log(bodyText.substring(0, 500)); return;
    }
    console.log(`   Body length: ${bodyText.length} chars`);

    // Click the first search result
    console.log("\n🖱️ Clicking first search result...");
    await stagehand.act("Click on the first game result for Elden Ring");
    await page.waitForTimeout(5000);
    console.log(`   ✅ Navigated to: ${page.url()}`);

    // DOM Exploration
    console.log("\n🌲 Accessible tree (first 3000 chars):");
    const ariaTree = await extractAriaScopeForXPath(page, "/html/body", 3000);
    console.log(ariaTree);

    // Stagehand extract
    console.log("\n🤖 Extracting game completion times...");
    const data = await stagehand.extract(
      "Extract the game title, main story completion time, main + extras completion time, and completionist time from this HowLongToBeat game page.",
      z.object({
        game_title: z.string(),
        main_story: z.string(),
        main_plus_extras: z.string(),
        completionist: z.string(),
      }),
    );
    console.log("\n📊 Extracted data:");
    console.log(JSON.stringify(data, null, 2));

  } catch (err) { console.error("❌ Error:", err.message); }
  finally { await stagehand.close(); console.log("\n✅ Done"); }
})();
