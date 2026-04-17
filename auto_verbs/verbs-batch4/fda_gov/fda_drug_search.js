/**
 * FDA.gov – Drug Approval Search
 *
 * Prompt:
 *   Search for drug approval information matching "ozempic".
 *   Extract drug name, active ingredient, approval date, manufacturer, and indications.
 *
 * Strategy:
 *   Direct URL: fda.gov/search?s=ozempic
 *   Then use Stagehand extract.
 */

const { Stagehand } = require("@browserbasehq/stagehand");
const { z } = require("zod");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");

/* ── kill switch ─────────────────────────────────────────── */
const TIMEOUT = 150_000;
setTimeout(() => { console.error("\n⏰ Global timeout – exiting"); process.exit(1); }, TIMEOUT);

/* ── config ──────────────────────────────────────────────── */
const CFG = {
  query: "ozempic",
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
    // ── Navigate to FDA search ───────────────────────────────
    const url = `https://www.fda.gov/search?s=${encodeURIComponent(CFG.query)}`;
    console.log(`🌐 Navigating to: ${url}`);
    recorder.record("navigate", { url });
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(8000);
    console.log(`   ✅ Loaded: ${page.url()}`);

    // ── Check page status ────────────────────────────────────
    const pageTitle = await page.title();
    const bodyText = await page.evaluate(() => document.body?.innerText || "");
    console.log(`   Title: ${pageTitle}`);
    console.log(`   Body length: ${bodyText.length}`);

    if (pageTitle.includes("Challenge") || bodyText.includes("security verification") || bodyText.length < 100) {
      console.log("🚫 Bot detection / challenge page detected.");
      
      // Try alternate URL: accessdata.fda.gov Drugs@FDA
      const altUrl = `https://www.accessdata.fda.gov/scripts/cder/daf/index.cfm?event=overview.process&ApplNo=209637`;
      console.log(`\n🔄 Trying alternate URL: ${altUrl}`);
      await page.goto(altUrl, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(5000);
      
      const altTitle = await page.title();
      const altBody = await page.evaluate(() => document.body?.innerText || "");
      console.log(`   Alt Title: ${altTitle}`);
      console.log(`   Alt Body length: ${altBody.length}`);
      
      if (altBody.length < 100 || altTitle.includes("Challenge")) {
        console.log("🚫 Both URLs blocked. FDA.gov uses heavy bot detection. Stopping.");
        process.exit(1);
      }
    }

    // ── DOM exploration ──────────────────────────────────────
    console.log("\n🔍 Exploring DOM structure...");
    const domInfo = await page.evaluate(() => {
      const info = {};
      info.bodyLength = document.body?.innerText.length || 0;
      
      // Search for result links
      const links = document.querySelectorAll('a');
      info.totalLinks = links.length;
      
      // Look for search results
      const results = document.querySelectorAll('.search-result, .views-row, [class*="result"]');
      info.resultElements = results.length;
      info.firstResults = Array.from(results).slice(0, 3).map(el => ({
        tag: el.tagName,
        className: el.className.substring(0, 100),
        text: el.innerText.trim().substring(0, 300),
      }));

      return info;
    });

    console.log(`Body length: ${domInfo.bodyLength}`);
    console.log(`Total links: ${domInfo.totalLinks}`);
    console.log(`Result elements: ${domInfo.resultElements}`);
    if (domInfo.firstResults) {
      domInfo.firstResults.forEach((r, i) => {
        console.log(`\n--- Result ${i} ---`);
        console.log(`  ${r.text.substring(0, 200)}`);
      });
    }

    // ── Extract using Stagehand ──────────────────────────────
    console.log(`\n🎯 Extracting drug info for "${CFG.query}"...`);

    const data = await stagehand.extract(
      `Extract drug approval information for ozempic from this FDA page. Get: drug name, active ingredient, approval date, manufacturer, and approved indications or uses.`,
      z.object({
        drug_name: z.string(),
        active_ingredient: z.string(),
        approval_date: z.string(),
        manufacturer: z.string(),
        indications: z.string(),
      })
    );

    console.log(`\n✅ Extracted drug info:`);
    console.log(`  Drug: ${data.drug_name}`);
    console.log(`  Active ingredient: ${data.active_ingredient}`);
    console.log(`  Approval date: ${data.approval_date}`);
    console.log(`  Manufacturer: ${data.manufacturer}`);
    console.log(`  Indications: ${data.indications}`);

    // ── Save recorded actions ────────────────────────────────
    const actionsPath = path.join(__dirname, "recorded_actions.json");
    fs.writeFileSync(actionsPath, JSON.stringify(recorder.actions, null, 2), "utf-8");
    console.log(`\n📋 Recorded actions: ${actionsPath}`);

  } catch (err) {
    console.error("❌ Error:", err.message);
  } finally {
    await stagehand.close();
  }
})();
