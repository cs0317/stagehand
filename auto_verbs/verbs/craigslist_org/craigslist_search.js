const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient, observeAndAct } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");
const os = require("os");

/**
 * Craigslist – For Sale Search
 *
 * Uses AI-driven discovery to search Craigslist For Sale listings
 * and extract title, price, and location.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  region: "sfbay",
  query: "bicycle",
  maxResults: 5,
  waits: { page: 3000, type: 2000 },
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
    const url = `https://${CFG.region}.craigslist.org/search/sss?query=${encodeURIComponent(CFG.query)}`;
    console.log(`\n── Navigating to ${url} ──`);
    await page.goto(url);
    recorder.goto(url);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(CFG.waits.page);

    // ── Extract listings ─────────────────────────────────────────────
    console.log(`\n── Extracting top ${CFG.maxResults} listings ──`);

    const { z } = require("zod/v3");
    const data = await stagehand.extract(
      `Extract the top ${CFG.maxResults} for-sale listings. For each, get the title, price, and location.`,
      z.object({
        listings: z.array(
          z.object({
            title: z.string(),
            price: z.string(),
            location: z.string(),
          })
        ),
      })
    );

    console.log(`\n── Results ──`);
    if (data.listings && data.listings.length > 0) {
      data.listings.forEach((l, i) => {
        console.log(`  ${i + 1}. ${l.title}`);
        console.log(`     Price:    ${l.price}`);
        console.log(`     Location: ${l.location}`);
      });
    } else {
      console.log("  No listings found.");
    }

  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
  }
})();
