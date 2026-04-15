const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient, observeAndAct } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");
const os = require("os");

/**
 * eBay – Seller Info Lookup
 *
 * Uses AI-driven discovery to search eBay, navigate to the first result,
 * and extract seller name, feedback score, and positive feedback percentage.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  url: "https://www.ebay.com",
  query: "vintage watch",
  waits: { page: 3000, type: 2000, search: 5000 },
};

// ── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({
    env: "LOCAL",
    verbose: 2,
    llmClient,
  });
  await stagehand.init();

  const recorder = new PlaywrightRecorder();
  const page = stagehand.context.pages()[0];

  try {
    // Navigate to eBay search results
    const url = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(CFG.query)}`;
    console.log(`\n── Navigating to ${url} ──`);
    await page.goto(url);
    recorder.goto(url);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(CFG.waits.page);

    // Click first real result
    console.log(`\n── Clicking first result ──`);
    await observeAndAct(stagehand, "Click on the first product listing (not a sponsored ad)", {
      maxAttempts: 3,
    });
    await page.waitForTimeout(CFG.waits.search);

    // Extract seller info
    console.log(`\n── Extracting seller info ──`);
    const { z } = require("zod/v3");
    const data = await stagehand.extract(
      "Extract the seller name, feedback score (number in parentheses), and positive feedback percentage from the seller card",
      z.object({
        seller_name: z.string(),
        feedback_score: z.string(),
        positive_feedback_pct: z.string(),
      })
    );

    console.log(`\n── Results ──`);
    console.log(`  Seller:     ${data.seller_name}`);
    console.log(`  Feedback:   ${data.feedback_score}`);
    console.log(`  Positive %: ${data.positive_feedback_pct}`);

  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
  }
})();
