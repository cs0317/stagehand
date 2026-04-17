/**
 * Apple Podcasts – Podcast Search
 *
 * Search for podcasts matching "true crime", extract up to 5 podcasts.
 */

const { Stagehand } = require("@browserbasehq/stagehand");
const { z } = require("zod");
const { setupLLMClient, extractAriaScopeForXPath } = require("../../stagehand-utils");

const TIMEOUT = 150_000;
setTimeout(() => { console.error("\n⏰ Global timeout – exiting"); process.exit(1); }, TIMEOUT);

const CFG = { query: "true crime", maxItems: 5 };

(async () => {
  const llmClient = setupLLMClient("copilot");
  const stagehand = new Stagehand({
    env: "LOCAL", verbose: 1, llmClient,
    localBrowserLaunchOptions: { headless: false, channel: "chrome", args: ["--disable-blink-features=AutomationControlled"] },
  });
  await stagehand.init();
  const page = stagehand.context.pages()[0];

  try {
    const url = `https://podcasts.apple.com/us/search?term=${encodeURIComponent(CFG.query)}`;
    console.log(`🌐 Navigating to: ${url}`);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(6000);
    console.log(`   ✅ Loaded: ${page.url()}`);

    const bodyText = await page.evaluate(() => document.body?.innerText || "");
    if (bodyText.includes("CAPTCHA") || bodyText.includes("Cloudflare") || bodyText.includes("Just a moment")) {
      console.error("🚫 Bot detection!"); console.log(bodyText.substring(0, 500)); return;
    }
    console.log(`   Body length: ${bodyText.length} chars`);

    console.log("\n🌲 Accessible tree (first 3000 chars):");
    const ariaTree = await extractAriaScopeForXPath(page, "/html/body", 3000);
    console.log(ariaTree);

    console.log("\n🤖 Extracting podcast listings...");
    const data = await stagehand.extract(
      `Extract the first ${CFG.maxItems} podcasts. For each get: podcast name, publisher/creator, category, and rating.`,
      z.object({
        podcasts: z.array(z.object({
          name: z.string(), publisher: z.string().optional(),
          category: z.string().optional(), rating: z.string().optional(),
        })),
      }),
    );
    console.log("\n📊 Extracted data:");
    console.log(JSON.stringify(data, null, 2));

  } catch (err) { console.error("❌ Error:", err.message); }
  finally { await stagehand.close(); console.log("\n✅ Done"); }
})();
