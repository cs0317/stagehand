/**
 * IMDB – Actor Profile Search
 *
 * Prompt:
 *   Search for "Meryl Streep", click on their profile, extract actor name,
 *   birth date, biography snippet, and up to 5 notable films.
 */

const { Stagehand } = require("@browserbasehq/stagehand");
const { z } = require("zod");
const { PlaywrightRecorder, setupLLMClient, extractAriaScopeForXPath } = require("../../stagehand-utils");

const TIMEOUT = 150_000;
setTimeout(() => { console.error("\n⏰ Global timeout – exiting"); process.exit(1); }, TIMEOUT);

const CFG = { query: "Meryl Streep" };

(async () => {
  const llmClient = setupLLMClient("copilot");
  const stagehand = new Stagehand({
    env: "LOCAL", verbose: 1, llmClient,
    localBrowserLaunchOptions: { headless: false, channel: "chrome", args: ["--disable-blink-features=AutomationControlled"] },
  });
  await stagehand.init();
  const page = stagehand.context.pages()[0];

  try {
    const url = `https://www.imdb.com/find/?q=${encodeURIComponent(CFG.query)}&s=nm`;
    console.log(`🌐 Navigating to: ${url}`);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(5000);
    console.log(`   ✅ Loaded: ${page.url()}`);

    const bodyText = await page.evaluate(() => document.body?.innerText || "");
    if (bodyText.includes("CAPTCHA") || bodyText.includes("Cloudflare") || bodyText.includes("Just a moment")) {
      console.error("🚫 Bot detection!"); console.log(bodyText.substring(0, 500)); return;
    }
    console.log(`   Body length: ${bodyText.length} chars`);

    // Click top result
    console.log("\n🖱️ Clicking first result for Meryl Streep...");
    await stagehand.act("Click on the first search result for Meryl Streep");
    await page.waitForTimeout(5000);
    console.log(`   ✅ Navigated to: ${page.url()}`);

    // DOM Exploration
    console.log("\n🌲 Accessible tree (first 3000 chars):");
    const ariaTree = await extractAriaScopeForXPath(page, "/html/body", 3000);
    console.log(ariaTree);

    // Stagehand extract
    console.log("\n🤖 Extracting actor profile...");
    const data = await stagehand.extract(
      "Extract the actor name, birth date, biography snippet (first 1-2 sentences), and up to 5 notable films with film title, year, and role played.",
      z.object({
        actor_name: z.string(),
        birth_date: z.string().optional(),
        bio_snippet: z.string().optional(),
        notable_films: z.array(z.object({
          title: z.string(),
          year: z.string().optional(),
          role: z.string().optional(),
        })),
      }),
    );
    console.log("\n📊 Extracted data:");
    console.log(JSON.stringify(data, null, 2));

  } catch (err) { console.error("❌ Error:", err.message); }
  finally { await stagehand.close(); console.log("\n✅ Done"); }
})();
