const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient, observeAndAct } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");
const os = require("os");

/**
 * Booking.com – Attractions Search
 *
 * Uses AI-driven discovery to find and navigate to the Attractions section
 * on Booking.com, search for attractions in a city, and extract top results.
 * Records interactions and generates a Python Playwright script.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  url: "https://www.booking.com/attractions",
  city: "Paris",
  maxResults: 5,
  waits: { page: 3000, type: 2000, select: 1000, search: 5000 },
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
    // ── Navigate to Booking.com Attractions ────────────────────────────
    console.log(`\n── Navigating to ${CFG.url} ──`);
    await page.goto(CFG.url);
    recorder.goto(CFG.url);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(CFG.waits.page);

    // Dismiss cookie banners / popups
    for (const selector of [
      "button#onetrust-accept-btn-handler",
      "[aria-label='Dismiss sign-in info.']",
      "button:has-text('Accept')",
      "button:has-text('Got it')",
    ]) {
      try {
        const btn = page.locator(selector).first();
        if (await btn.isVisible({ timeout: 1500 })) {
          await btn.evaluate((el) => el.click());
          await page.waitForTimeout(500);
          console.log(`  Dismissed: ${selector}`);
        }
      } catch (_) {}
    }

    // ── STEP 1: Search for attractions in city ──────────────────────────
    console.log(`\n── STEP 1: Search for attractions in "${CFG.city}" ──`);

    // Use observeAndAct to find and interact with the search input
    await observeAndAct(stagehand, `Type "${CFG.city}" into the attractions search box`, {
      maxAttempts: 3,
    });
    recorder.fill("attractions-search-input", CFG.city, `Type "${CFG.city}" in search`);
    await page.waitForTimeout(CFG.waits.type);

    // Select a suggestion or submit
    try {
      await observeAndAct(stagehand, `Select the first search suggestion for "${CFG.city}"`, {
        maxAttempts: 2,
      });
      recorder.click("first-suggestion", "Select first autocomplete suggestion");
    } catch (e) {
      console.log("  No suggestion found, pressing Enter");
      await page.keyboard.press("Enter");
    }
    await page.waitForTimeout(CFG.waits.search);

    // ── STEP 2: Wait for results and extract ─────────────────────────
    console.log(`\n── STEP 2: Extract top ${CFG.maxResults} attractions ──`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(CFG.waits.page);

    // Use stagehand extract to get attraction data
    const { z } = require("zod/v3");
    const data = await stagehand.extract(
      `Extract the top ${CFG.maxResults} attractions shown on this page. For each attraction, get the name, rating (numeric), and price.`,
      z.object({
        attractions: z.array(
          z.object({
            name: z.string(),
            rating: z.string(),
            price: z.string(),
          })
        ),
      })
    );

    console.log(`\n── Results ──`);
    if (data.attractions && data.attractions.length > 0) {
      data.attractions.forEach((a, i) => {
        console.log(`  ${i + 1}. ${a.name}`);
        console.log(`     Rating: ${a.rating}`);
        console.log(`     Price:  ${a.price}`);
      });
    } else {
      console.log("  No attractions found via extract. Inspecting page...");
      
      // Fallback: use extractAriaScopeForXPath to discover page structure
      const { extractAriaScopeForXPath } = require("../../stagehand-utils");
      const bodyText = await page.locator("body").innerText();
      console.log("  Page text (first 2000 chars):", bodyText.substring(0, 2000));
    }

  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
  }
})();
