const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient, observeAndAct } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");
const os = require("os");

const CFG = {
  url: "https://www.foodnetwork.com",
  query: "pasta",
  maxResults: 5,
  waits: { page: 3000, type: 2000, search: 5000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Food Network – Recipe Search
Query: ${cfg.query}

Generated on: ${ts}
Recorded ${n} browser interactions
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
    profile_dir = get_temp_profile_dir("foodnetwork_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        print("Loading Food Network...")
        page.goto("${cfg.url}")
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(2000)

        for selector in [
            "button#onetrust-accept-btn-handler",
            "button:has-text('Accept')",
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
            'input[name="searchTerm"], '
            'input[aria-label*="search" i], '
            'input[placeholder*="search" i], '
            'input[type="search"]'
        ).first
        search_input.evaluate("el => el.click()")
        page.wait_for_timeout(500)
        page.keyboard.press("Control+a")
        search_input.type(query, delay=50)
        page.wait_for_timeout(1000)
        page.keyboard.press("Enter")
        print(f'  Typed "{query}" and pressed Enter')
        page.wait_for_timeout(2000)
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(2000)

        # ── STEP 2: Extract recipes ───────────────────────────────────────
        print(f"STEP 2: Extract up to {max_results} recipes...")

        recipe_cards = page.locator(
            'section[class*="recipe"] article, '
            'div[class*="recipe-card"], '
            'li[class*="recipe"], '
            'article[class*="recipe"]'
        )
        count = recipe_cards.count()
        print(f"  Found {count} recipe cards")

        for i in range(min(count, max_results)):
            card = recipe_cards.nth(i)
            try:
                name = "N/A"
                rating = "N/A"
                total_time = "N/A"

                try:
                    name_el = card.locator('h3, h4, a[class*="title"], span[class*="title"]').first
                    name = name_el.inner_text(timeout=2000).strip()
                except Exception:
                    pass

                try:
                    rating_el = card.locator('[class*="rating"], [class*="star"], [data-testid*="rating"]').first
                    rating = rating_el.inner_text(timeout=2000).strip()
                except Exception:
                    pass

                try:
                    time_el = card.locator('[class*="time"], [class*="duration"], time').first
                    total_time = time_el.inner_text(timeout=2000).strip()
                except Exception:
                    pass

                if name != "N/A":
                    results.append({"name": name, "rating": rating, "total_time": total_time})
                    print(f"  {len(results)}. {name} | Rating: {rating} | Time: {total_time}")

            except Exception as e:
                print(f"  Error on card {i}: {e}")
                continue

        print(f"\\nFound {len(results)} recipes for '{query}':")
        for i, r in enumerate(results, 1):
            print(f"  {i}. {r['name']}")
            print(f"     Rating: {r['rating']}  Total Time: {r['total_time']}")

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

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Food Network – Recipe Search");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const recorder = new PlaywrightRecorder();
  const llmClient = setupLLMClient("hybrid");
  let stagehand;

  try {
    stagehand = new Stagehand({
      env: "LOCAL", verbose: 0, llmClient,
      localBrowserLaunchOptions: {
        userDataDir: path.join(os.homedir(), "AppData", "Local", "Google", "Chrome", "User Data", "Default"),
        headless: false, viewport: { width: 1920, height: 1080 },
        args: ["--disable-blink-features=AutomationControlled", "--disable-infobars", "--disable-extensions", "--start-maximized", "--window-size=1920,1080"],
      },
    });
    await stagehand.init();
    const page = stagehand.context.pages()[0];

    recorder.goto(CFG.url);
    await page.goto(CFG.url);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(CFG.waits.page);

    await observeAndAct(stagehand, page, recorder, `Click the search input field`, "Click search input");
    await page.waitForTimeout(500);
    await stagehand.act(`Clear the search field and type '${CFG.query}'`);
    recorder.record("act", { instruction: `Type '${CFG.query}'`, description: `Fill search: ${CFG.query}`, method: "type" });
    await page.waitForTimeout(CFG.waits.type);
    await stagehand.act("Press Enter to search");
    recorder.record("act", { instruction: "Press Enter", description: "Submit search", method: "press" });
    await page.waitForTimeout(CFG.waits.search);

    const { z } = require("zod/v3");
    const listings = await stagehand.extract(
      `Extract up to ${CFG.maxResults} recipe search results. For each recipe, get the name, rating, and total cook time.`,
      z.object({
        recipes: z.array(z.object({
          name: z.string(), rating: z.string(), totalTime: z.string(),
        })),
      })
    );
    recorder.record("extract", { instruction: "Extract recipes", results: listings });

    fs.writeFileSync(path.join(__dirname, "foodnetwork_search.py"), genPython(CFG, recorder), "utf-8");
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2), "utf-8");
    console.log("✅ Files saved");
    return listings;
  } catch (err) {
    console.error("❌ Error:", err.message);
    if (recorder?.actions.length > 0) fs.writeFileSync(path.join(__dirname, "foodnetwork_search.py"), genPython(CFG, recorder), "utf-8");
    throw err;
  } finally {
    if (stagehand) await stagehand.close();
  }
}

if (require.main === module) {
  main().then(() => { console.log("🎊 Done!"); process.exit(0); }).catch((e) => { console.error("💥", e.message); process.exit(1); });
}
module.exports = { main };
