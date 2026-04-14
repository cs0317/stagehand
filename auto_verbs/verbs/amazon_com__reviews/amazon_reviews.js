const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient, observeAndAct } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");
const os = require("os");

/**
 * Amazon.com – Product Reviews
 *
 * Uses AI-driven discovery to search Amazon, click the first product,
 * navigate to reviews, and extract them.
 * Records interactions and generates a Python Playwright script.
 * Does not take any screenshots.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  url: "https://www.amazon.com",
  query: "wireless earbuds",
  maxResults: 5,
  waits: { page: 3000, type: 2000, search: 5000 },
};

// ── Python Script Generator ──────────────────────────────────────────────────
function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Amazon.com – Product Reviews
Query: ${cfg.query}

Generated on: ${ts}
Recorded ${n} browser interactions

Uses Playwright via CDP connection with the user's Chrome profile.
"""

import re
import os, sys, shutil
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws


def run(
    playwright: Playwright,
    query: str = "${cfg.query}",
    max_results: int = ${cfg.maxResults},
) -> list:
    print(f"  Query: {query}")
    print(f"  Max reviews: {max_results}\\n")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("amazon_com_reviews")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        # ── Navigate ──────────────────────────────────────────────────────
        print("Loading Amazon.com...")
        page.goto("${cfg.url}")
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(2000)

        # ── Dismiss popups ────────────────────────────────────────────────
        for selector in [
            "#sp-cc-accept",
            "input[data-action-type='DISMISS']",
            "button:has-text('Accept')",
        ]:
            try:
                btn = page.locator(selector).first
                if btn.is_visible(timeout=1500):
                    btn.evaluate("el => el.click()")
                    page.wait_for_timeout(500)
            except Exception:
                pass

        # ── STEP 1: Search ────────────────────────────────────────────────
        print(f'STEP 1: Search for "{query}"...')
        search_input = page.locator('#twotabsearchtextbox').first
        search_input.evaluate("el => el.click()")
        page.wait_for_timeout(500)
        page.keyboard.press("Control+a")
        search_input.type(query, delay=50)
        page.wait_for_timeout(1000)
        page.keyboard.press("Enter")
        print(f'  Typed "{query}" and pressed Enter')
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(2000)

        # ── STEP 2: Click first result ────────────────────────────────────
        print("STEP 2: Click the first search result...")
        first_result = page.locator(
            "[data-component-type='s-search-result'] h2 a"
        ).first
        product_name = first_result.inner_text(timeout=2000).strip()
        first_result.evaluate("el => el.click()")
        print(f'  Clicked: "{product_name}"')
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(2000)

        # ── STEP 3: Navigate to reviews ───────────────────────────────────
        print("STEP 3: Navigate to customer reviews section...")
        # Try "See all reviews" link first, then "See more reviews"
        reviews_link = page.locator(
            'a[data-hook="see-all-reviews-link-foot"], '
            'a:has-text("See all reviews"), '
            'a:has-text("See more reviews"), '
            '#reviews-medley-footer a'
        ).first
        try:
            reviews_link.scroll_into_view_if_needed(timeout=5000)
            reviews_link.evaluate("el => el.click()")
            print("  Clicked 'See all reviews' link")
        except Exception:
            # Fallback: scroll to review section
            print("  No reviews link found, scrolling to review section...")
            page.evaluate("document.getElementById('reviewsMedley')?.scrollIntoView()")
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(2000)

        # ── STEP 4: Extract reviews ───────────────────────────────────────
        print(f"STEP 4: Extract up to {max_results} reviews...")

        review_cards = page.locator('[data-hook="review"]')
        count = review_cards.count()
        print(f"  Found {count} review cards")

        for i in range(count):
            if len(results) >= max_results:
                break
            card = review_cards.nth(i)
            try:
                star_rating = "N/A"
                title = "N/A"
                review_text = "N/A"

                # Star rating
                try:
                    star_el = card.locator('[data-hook="review-star-rating"] .a-icon-alt, [data-hook="cmps-review-star-rating"] .a-icon-alt').first
                    star_text = star_el.inner_text(timeout=2000).strip()
                    sm = re.search(r"([\\d.]+) out of", star_text)
                    if sm:
                        star_rating = sm.group(1)
                except Exception:
                    pass

                # Review title
                try:
                    title_el = card.locator('[data-hook="review-title"] span, [data-hook="review-title"]').first
                    title = title_el.inner_text(timeout=2000).strip()
                    # Remove rating prefix if present
                    title = re.sub(r'^\\d+\\.\\d+ out of \\d+ stars\\s*', '', title).strip()
                except Exception:
                    pass

                # Review text
                try:
                    text_el = card.locator('[data-hook="review-body"] span').first
                    review_text = text_el.inner_text(timeout=2000).strip()
                    # Truncate long reviews
                    if len(review_text) > 300:
                        review_text = review_text[:300] + "..."
                except Exception:
                    pass

                if title == "N/A" and review_text == "N/A":
                    continue

                results.append({
                    "star_rating": star_rating,
                    "title": title,
                    "review_text": review_text,
                })
                print(f"  {len(results)}. [{star_rating} stars] {title}")

            except Exception as e:
                print(f"  Error on review {i}: {e}")
                continue

        # ── Print results ─────────────────────────────────────────────────
        print(f"\\nFound {len(results)} reviews for '{query}' — Product: {product_name}")
        for i, r in enumerate(results, 1):
            print(f"  {i}. [{r['star_rating']} stars] {r['title']}")
            print(f"     {r['review_text'][:120]}...")

    except Exception as e:
        import traceback
        print(f"Error: {e}")
        traceback.print_exc()
    finally:
        try:
            browser.close()
        except Exception:
            pass
        chrome_proc.terminate()
        shutil.rmtree(profile_dir, ignore_errors=True)

    return results


if __name__ == "__main__":
    with sync_playwright() as playwright:
        items = run(playwright)
        print(f"\\nTotal reviews found: {len(items)}")
`;
}

// ── Step Functions ───────────────────────────────────────────────────────────

async function dismissPopups(page) {
  console.log("🔲 Dismissing popups...");
  for (const sel of [
    "#sp-cc-accept",
    "input[data-action-type='DISMISS']",
    "button:has-text('Accept')",
  ]) {
    try {
      const btn = page.locator(sel);
      if (await btn.isVisible({ timeout: 1500 })) {
        await btn.click();
        console.log(`   ✅ Dismissed: ${sel}`);
      }
    } catch (e) { /* no popup */ }
  }
  await page.waitForTimeout(500);
}

async function searchProduct(stagehand, page, recorder, query) {
  console.log(`🎯 STEP 1: Search for "${query}"...`);

  await observeAndAct(stagehand, page, recorder,
    `Click the search input field`,
    "Click search input"
  );
  await page.waitForTimeout(500);

  await stagehand.act(`Clear the search field and type '${query}'`);
  console.log(`   ✅ Typed "${query}"`);
  recorder.record("act", {
    instruction: `Type '${query}' into search`,
    description: `Fill search: ${query}`,
    method: "type",
  });
  await page.waitForTimeout(CFG.waits.type);

  await stagehand.act("Press Enter to search");
  console.log("   ✅ Pressed Enter");
  await page.waitForTimeout(CFG.waits.search);
  await page.waitForLoadState("domcontentloaded");
  console.log(`   📍 URL: ${page.url()}`);
}

async function clickFirstResult(stagehand, page, recorder) {
  console.log("🎯 STEP 2: Click the first search result...");

  await observeAndAct(stagehand, page, recorder,
    `Click the first product search result title link`,
    "Click first product result"
  );
  console.log("   ✅ Clicked first result");

  await page.waitForTimeout(CFG.waits.search);
  await page.waitForLoadState("domcontentloaded");
  console.log(`   📍 URL: ${page.url()}`);
}

async function navigateToReviews(stagehand, page, recorder) {
  console.log("🎯 STEP 3: Navigate to customer reviews section...");

  try {
    await observeAndAct(stagehand, page, recorder,
      `Click the "See all reviews" or "See more reviews" link to view all customer reviews`,
      "Click See all reviews link"
    );
    console.log("   ✅ Clicked reviews link");
  } catch (e) {
    console.log("   ⚠️  No reviews link found, trying to scroll to review section");
    await stagehand.act("Scroll down to the customer reviews section");
  }

  await page.waitForTimeout(CFG.waits.search);
  await page.waitForLoadState("domcontentloaded");
}

async function extractReviews(stagehand, page, recorder) {
  console.log(`🎯 STEP 4: Extract up to ${CFG.maxResults} reviews...\n`);
  const { z } = require("zod/v3");

  const listings = await stagehand.extract(
    `Extract up to ${CFG.maxResults} customer reviews. For each review, get the star rating (a number like "5.0"), the review title, and the review text (truncated to 300 chars). Only real customer reviews, not editorial reviews.`,
    z.object({
      reviews: z.array(z.object({
        starRating: z.string().describe("Star rating, e.g. '5.0'"),
        title: z.string().describe("Review title"),
        reviewText: z.string().describe("Review body text, truncated to 300 chars"),
      })).describe(`Up to ${CFG.maxResults} reviews`),
    })
  );

  recorder.record("extract", {
    instruction: "Extract customer reviews",
    description: `Extract up to ${CFG.maxResults} reviews`,
    results: listings,
  });

  console.log(`📋 Found ${listings.reviews.length} reviews:`);
  listings.reviews.forEach((r, i) => {
    console.log(`   ${i + 1}. [${r.starRating} stars] ${r.title}`);
    console.log(`      ${r.reviewText.substring(0, 120)}...`);
  });

  return listings;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Amazon.com – Product Reviews");
  console.log("  🔍 AI-driven discovery + Playwright locators");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  🔎 Query: "${CFG.query}"`);
  console.log(`  📋 Max reviews: ${CFG.maxResults}\n`);

  const recorder = new PlaywrightRecorder();
  const llmClient = setupLLMClient("hybrid");
  let stagehand;

  try {
    console.log("🎭 Initializing Stagehand...");
    stagehand = new Stagehand({
      env: "LOCAL",
      verbose: 0,
      llmClient,
      localBrowserLaunchOptions: {
        userDataDir: path.join(os.homedir(), "AppData", "Local", "Google", "Chrome", "User Data", "Default"),
        headless: false,
        viewport: { width: 1920, height: 1080 },
        args: ["--disable-blink-features=AutomationControlled", "--disable-infobars", "--disable-extensions", "--start-maximized", "--window-size=1920,1080"],
      },
    });
    await stagehand.init();
    console.log("✅ Stagehand ready\n");

    const page = stagehand.context.pages()[0];

    // Navigate
    console.log("🌐 Loading Amazon.com...");
    recorder.goto(CFG.url);
    await page.goto(CFG.url);
    await page.waitForLoadState("domcontentloaded");
    console.log("✅ Loaded\n");
    recorder.wait(CFG.waits.page, "Initial page load");
    await page.waitForTimeout(CFG.waits.page);

    await dismissPopups(page);
    await searchProduct(stagehand, page, recorder, CFG.query);
    await clickFirstResult(stagehand, page, recorder);
    await navigateToReviews(stagehand, page, recorder);

    const listings = await extractReviews(stagehand, page, recorder);

    console.log("\n═══════════════════════════════════════════════════════════");
    console.log(`  ✅ DONE — ${listings.reviews.length} reviews found`);
    console.log("═══════════════════════════════════════════════════════════");
    listings.reviews.forEach((r, i) => {
      console.log(`  ${i + 1}. [${r.starRating} stars] ${r.title}`);
    });

    // Save Python + JSON
    const pyScript = genPython(CFG, recorder);
    const pyPath = path.join(__dirname, "amazon_reviews.py");
    fs.writeFileSync(pyPath, pyScript, "utf-8");
    console.log(`\n✅ Python: ${pyPath}`);

    const jsonPath = path.join(__dirname, "recorded_actions.json");
    fs.writeFileSync(jsonPath, JSON.stringify(recorder.actions, null, 2), "utf-8");
    console.log(`📋 Actions: ${jsonPath}`);

    return listings;

  } catch (err) {
    console.error("\n❌ Error:", err.message);
    if (recorder?.actions.length > 0) {
      const pyScript = genPython(CFG, recorder);
      fs.writeFileSync(path.join(__dirname, "amazon_reviews.py"), pyScript, "utf-8");
      console.log("⚠️  Partial Python saved");
    }
    throw err;
  } finally {
    if (stagehand) {
      console.log("🧹 Closing...");
      await stagehand.close();
    }
  }
}

if (require.main === module) {
  main().then(() => { console.log("🎊 Done!"); process.exit(0); }).catch((e) => { console.error("💥", e.message); process.exit(1); });
}
module.exports = { main };
