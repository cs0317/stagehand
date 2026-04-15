const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient, observeAndAct } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");
const os = require("os");

const CFG = {
  url: "https://www.gap.com",
  query: "men's jeans",
  maxResults: 5,
  waits: { page: 3000, type: 2000, search: 5000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Gap.com – Product Search
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
    profile_dir = get_temp_profile_dir("gap_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        print("Loading Gap.com...")
        page.goto("${cfg.url}")
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(2000)

        for selector in [
            "button#onetrust-accept-btn-handler",
            "button:has-text('Accept')",
            "button:has-text('Close')",
            "button[aria-label='close']",
        ]:
            try:
                btn = page.locator(selector).first
                if btn.is_visible(timeout=1500):
                    btn.evaluate("el => el.click()")
                    page.wait_for_timeout(500)
            except Exception:
                pass

        print(f'STEP 1: Search for "{query}"...')
        search_input = page.locator(
            'input[name="searchText"], '
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
        page.wait_for_timeout(2000)
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(2000)

        print(f"STEP 2: Extract up to {max_results} products...")
        product_cards = page.locator(
            '[data-testid="product-card"], '
            'div[class*="product-card"], '
            'article[class*="product"]'
        )
        count = product_cards.count()
        print(f"  Found {count} product cards")

        for i in range(min(count, max_results)):
            card = product_cards.nth(i)
            try:
                name = "N/A"
                price = "N/A"
                sizes = "N/A"

                try:
                    name_el = card.locator('h3, h4, a[class*="name"], [class*="product-name"]').first
                    name = name_el.inner_text(timeout=2000).strip()
                except Exception:
                    pass

                try:
                    price_el = card.locator('[class*="price"], span:has-text("$")').first
                    price = price_el.inner_text(timeout=2000).strip()
                except Exception:
                    pass

                try:
                    size_el = card.locator('[class*="size"], [class*="swatch"]').first
                    sizes = size_el.inner_text(timeout=2000).strip()
                except Exception:
                    pass

                if name != "N/A":
                    results.append({"name": name, "price": price, "sizes": sizes})
                    print(f"  {len(results)}. {name} | {price} | Sizes: {sizes}")

            except Exception as e:
                print(f"  Error on card {i}: {e}")
                continue

        print(f"\\nFound {len(results)} products for '{query}':")
        for i, r in enumerate(results, 1):
            print(f"  {i}. {r['name']}")
            print(f"     Price: {r['price']}  Sizes: {r['sizes']}")

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
        print(f"\\nTotal products found: {len(items)}")
`;
}

async function main() {
  const recorder = new PlaywrightRecorder();
  const llmClient = setupLLMClient("hybrid");
  let stagehand;
  try {
    stagehand = new Stagehand({ env: "LOCAL", verbose: 0, llmClient,
      localBrowserLaunchOptions: { userDataDir: path.join(os.homedir(), "AppData", "Local", "Google", "Chrome", "User Data", "Default"), headless: false, viewport: { width: 1920, height: 1080 }, args: ["--disable-blink-features=AutomationControlled", "--disable-infobars", "--disable-extensions", "--start-maximized", "--window-size=1920,1080"] },
    });
    await stagehand.init();
    const page = stagehand.context.pages()[0];
    recorder.goto(CFG.url); await page.goto(CFG.url); await page.waitForLoadState("domcontentloaded"); await page.waitForTimeout(CFG.waits.page);
    await observeAndAct(stagehand, page, recorder, `Click the search input field`, "Click search input");
    await stagehand.act(`Clear the search field and type '${CFG.query}'`);
    recorder.record("act", { instruction: `Type '${CFG.query}'`, description: `Fill search`, method: "type" });
    await page.waitForTimeout(CFG.waits.type);
    await stagehand.act("Press Enter to search");
    await page.waitForTimeout(CFG.waits.search);

    const { z } = require("zod/v3");
    const listings = await stagehand.extract(
      `Extract up to ${CFG.maxResults} product search results. For each get the name, price, and available sizes.`,
      z.object({ products: z.array(z.object({ name: z.string(), price: z.string(), sizes: z.string() })) })
    );
    recorder.record("extract", { instruction: "Extract products", results: listings });
    fs.writeFileSync(path.join(__dirname, "gap_search.py"), genPython(CFG, recorder), "utf-8");
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2), "utf-8");
    return listings;
  } catch (err) {
    console.error("❌ Error:", err.message);
    if (recorder?.actions.length > 0) fs.writeFileSync(path.join(__dirname, "gap_search.py"), genPython(CFG, recorder), "utf-8");
    throw err;
  } finally { if (stagehand) await stagehand.close(); }
}

if (require.main === module) { main().then(() => process.exit(0)).catch(() => process.exit(1)); }
module.exports = { main };
