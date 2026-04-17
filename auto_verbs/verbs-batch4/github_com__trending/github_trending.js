/**
 * GitHub Trending – Trending Repositories
 *
 * Prompt:
 *   Navigate to the GitHub Trending page.
 *   Filter by language "Python" and date range "This week".
 *   Extract up to 10 trending repositories with repo name, description, language, total stars, stars this week.
 *
 * Strategy:
 *   Direct URL: github.com/trending/python?since=weekly
 *   Then use Stagehand extract to pull repo details.
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
    // ── Navigate to GitHub Trending ─────────────────────────
    const url = "https://github.com/trending/python?since=weekly";
    console.log(`🌐 Navigating to: ${url}`);
    recorder.record("navigate", { url });
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(5000);
    console.log(`   ✅ Loaded: ${page.url()}`);

    // ── Check for bot detection ─────────────────────────────
    const bodyText = await page.evaluate(() => document.body?.innerText || "");
    if (bodyText.includes("CAPTCHA") || bodyText.includes("Access Denied") || bodyText.includes("Cloudflare")) {
      console.error("🚫 Bot detection triggered!");
      console.log("Body preview:", bodyText.substring(0, 500));
      return;
    }
    console.log(`   Body length: ${bodyText.length} chars`);

    // ── DOM Exploration ─────────────────────────────────────
    console.log("\n📐 DOM Exploration – repo row selectors");
    const selectors = [
      'article.Box-row',
      'article[class*="Box-row"]',
      'div[class*="Box-row"]',
      'h2 a[href*="/"]',
      'span[class*="repo"]',
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
    console.log("\n🤖 Using Stagehand to extract trending repos...");
    const data = await stagehand.extract(
      "Extract the first 10 trending Python repositories. For each get: repo name (owner/repo format), description, programming language, total number of stars, and stars gained this week.",
      z.object({
        repos: z.array(z.object({
          repo_name: z.string(),
          description: z.string(),
          language: z.string(),
          total_stars: z.string(),
          stars_this_week: z.string(),
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
