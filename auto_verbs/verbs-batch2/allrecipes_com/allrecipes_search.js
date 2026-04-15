const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient, observeAndAct } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");
const os = require("os");

/**
 * Allrecipes.com – Recipe Search
 *
 * Uses AI-driven discovery to search allrecipes.com for recipes,
 * then generates a pure-Playwright Python script.
 * Does not take any screenshots.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  url: "https://www.allrecipes.com",
  query: "chicken parmesan",
  maxResults: 5,
  waits: { page: 3000, type: 2000, search: 5000 },
};

// ── Python Script Generator ──────────────────────────────────────────────────
function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Allrecipes.com – Recipe Search
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
    print(f"  Max results: {max_results}\\n")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("allrecipes_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        # ── Navigate ──────────────────────────────────────────────────────
        print("Loading Allrecipes.com...")
        page.goto("${cfg.url}")
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(3000)

        # ── Dismiss popups / cookie banners ───────────────────────────────
        for selector in [
            "button#onetrust-accept-btn-handler",
            "button:has-text('Accept')",
            "button:has-text('Got it')",
            "button:has-text('Close')",
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
        search_input = page.locator(
            'input#search-input, '
            'input[name="search"], '
            'input[aria-label*="search" i], '
            'input[placeholder*="search" i]'
        ).first
        search_input.evaluate("el => el.click()")
        page.wait_for_timeout(500)
        page.keyboard.press("Control+a")
        search_input.type(query, delay=50)
        page.wait_for_timeout(1000)
        page.keyboard.press("Enter")
        print(f'  Typed "{query}" and pressed Enter')
        page.wait_for_timeout(5000)

        # ── STEP 2: Extract recipes ───────────────────────────────────────
        print(f"STEP 2: Extract up to {max_results} recipes...")

        recipe_cards = page.locator(
            'a[id^="mntl-card-list-items_"], '
            'a.mntl-card-list-card, '
            'article.card, '
            'div[data-testid="search-result"]'
        )
        count = recipe_cards.count()
        print(f"  Found {count} recipe cards")

        for i in range(count):
            if len(results) >= max_results:
                break
            card = recipe_cards.nth(i)
            try:
                name = "N/A"
                rating = "N/A"
                cook_time = "N/A"

                # Recipe name
                try:
                    name_el = card.locator(
                        'span.card__title-text, '
                        'span[class*="title"], '
                        'h3, h4'
                    ).first
                    name = name_el.inner_text(timeout=3000).strip()
                except Exception:
                    try:
                        name = card.get_attribute("aria-label") or "N/A"
                    except Exception:
                        pass

                if name == "N/A":
                    continue

                # Click into recipe page to get rating and cook time
                card.evaluate("el => el.click()")
                page.wait_for_timeout(2000)

                # Rating
                try:
                    rating_el = page.locator(
                        '#mntl-recipe-review-bar__rating_1-0, '
                        '[id*="recipe-review-bar__rating"], '
                        'span[class*="rating-star__count"], '
                        'div[id*="star-rating"]'
                    ).first
                    rating_text = rating_el.inner_text(timeout=3000).strip()
                    rm = re.search(r"[\\d.]+", rating_text)
                    if rm:
                        rating = rm.group(0)
                except Exception:
                    pass

                # Cook time
                try:
                    time_el = page.locator(
                        'div.mntl-recipe-details__item:has-text("Total Time") .mntl-recipe-details__value, '
                        '[class*="recipe-details"] :has-text("Total") + *, '
                        '[class*="totalTime"], '
                        'time[itemprop="totalTime"]'
                    ).first
                    cook_time = time_el.inner_text(timeout=3000).strip()
                except Exception:
                    # Fallback: look for "Total Time" in page text
                    try:
                        body = page.locator("body").inner_text(timeout=5000)
                        tm = re.search(r"Total Time[:\\s]*(\\d+\\s*(?:hrs?|mins?|hours?|minutes?)[\\s\\d]*)", body, re.IGNORECASE)
                        if tm:
                            cook_time = tm.group(1).strip()
                    except Exception:
                        pass

                results.append({
                    "name": name,
                    "rating": rating,
                    "cook_time": cook_time,
                })
                print(f"  {len(results)}. {name} | Rating: {rating} | Time: {cook_time}")

                # Go back to search results
                page.go_back()
                page.wait_for_timeout(2000)

            except Exception as e:
                print(f"  Error on card {i}: {e}")
                try:
                    page.go_back()
                    page.wait_for_timeout(2000)
                except Exception:
                    pass
                continue

        # ── Print results ─────────────────────────────────────────────────
        print(f"\\nFound {len(results)} recipes for '{query}':")
        for i, r in enumerate(results, 1):
            print(f"  {i}. {r['name']}")
            print(f"     Rating: {r['rating']}  Cook Time: {r['cook_time']}")

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
        print(f"\\nTotal recipes found: {len(items)}")
`;
}

// ── Step Functions ───────────────────────────────────────────────────────────

async function dismissPopups(page) {
  console.log("🔲 Dismissing popups...");
  for (const sel of [
    "button#onetrust-accept-btn-handler",
    "button:has-text('Accept')",
    "button:has-text('Got it')",
    "button:has-text('Close')",
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

async function searchRecipes(stagehand, page, recorder, query) {
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
  recorder.record("act", {
    instruction: "Press Enter to search",
    description: "Submit search",
    method: "press",
  });

  await page.waitForTimeout(CFG.waits.search);
  await page.waitForLoadState("domcontentloaded");
  console.log(`   📍 URL: ${page.url()}`);
}

async function extractRecipes(stagehand, page, recorder) {
  console.log(`🎯 STEP 2: Extract up to ${CFG.maxResults} recipes...\n`);
  const { z } = require("zod/v3");

  const listings = await stagehand.extract(
    `Extract up to ${CFG.maxResults} recipe search results from this page. For each recipe, get the recipe name, star rating (a number like "4.7"), and total cook time (like "45 mins" or "1 hr 15 mins"). Only real recipe results, not ads.`,
    z.object({
      recipes: z.array(z.object({
        name: z.string().describe("Recipe name"),
        rating: z.string().describe("Star rating, e.g. '4.7'"),
        cookTime: z.string().describe("Total cook time, e.g. '45 mins'"),
      })).describe(`Up to ${CFG.maxResults} recipes`),
    })
  );

  recorder.record("extract", {
    instruction: "Extract recipe search results",
    description: `Extract up to ${CFG.maxResults} recipes`,
    results: listings,
  });

  console.log(`📋 Found ${listings.recipes.length} recipes:`);
  listings.recipes.forEach((r, i) => {
    console.log(`   ${i + 1}. ${r.name}`);
    console.log(`      ⭐ ${r.rating}  ⏱️ ${r.cookTime}`);
  });

  return listings;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Allrecipes.com – Recipe Search");
  console.log("  🔍 AI-driven discovery + Playwright locators");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  🍳 Query: "${CFG.query}"`);
  console.log(`  📋 Max results: ${CFG.maxResults}\n`);

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
    console.log("🌐 Loading Allrecipes.com...");
    recorder.goto(CFG.url);
    await page.goto(CFG.url);
    await page.waitForLoadState("domcontentloaded");
    console.log("✅ Loaded\n");
    recorder.wait(CFG.waits.page, "Initial page load");
    await page.waitForTimeout(CFG.waits.page);

    await dismissPopups(page);
    await searchRecipes(stagehand, page, recorder, CFG.query);

    const listings = await extractRecipes(stagehand, page, recorder);

    console.log("\n═══════════════════════════════════════════════════════════");
    console.log(`  ✅ DONE — ${listings.recipes.length} recipes found`);
    console.log("═══════════════════════════════════════════════════════════");
    listings.recipes.forEach((r, i) => {
      console.log(`  ${i + 1}. ${r.name} — Rating: ${r.rating}  Time: ${r.cookTime}`);
    });

    // Save Python + JSON
    const pyScript = genPython(CFG, recorder);
    const pyPath = path.join(__dirname, "allrecipes_search.py");
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
      fs.writeFileSync(path.join(__dirname, "allrecipes_search.py"), pyScript, "utf-8");
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
