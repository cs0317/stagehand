const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * ASOS.com – Product Search
 *
 * Uses AI-driven discovery to search ASOS for products.
 * Records interactions and generates a Python Playwright script.
 */

const CFG = {
  url: "https://www.asos.com",
  query: "men's jackets",
  maxResults: 5,
  waits: { page: 3000, type: 1000, search: 5000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
ASOS.com – Product Search
Query: ${cfg.query}
Max results: ${cfg.maxResults}

Generated on: ${ts}
Recorded ${n} browser interactions

Uses Playwright with CDP connection to a real Chrome instance.
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
    profile_dir = get_temp_profile_dir("asos_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        # ── Navigate directly to search results ──────────────────────────
        search_query = query.replace(" ", "+")
        search_url = f"${cfg.url}/search/?q={search_query}"
        print(f"Loading {search_url}...")
        page.goto(search_url)
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(5000)
        print(f"  Loaded: {page.url}")

        # ── Extract products ──────────────────────────────────────────────
        print(f"Extracting up to {max_results} products...")

        # ASOS product cards are li[id^="product-"] elements
        # Each contains an <a> with aria-label="Product Name, Price £XX.XX"
        product_cards = page.locator("li[id^='product-']")
        count = product_cards.count()
        print(f"  Found {count} product cards on page")

        for i in range(min(count, max_results)):
            card = product_cards.nth(i)
            try:
                # The product link has aria-label with name and price
                link = card.locator("a[href*='/prd/']").first
                aria_label = link.get_attribute("aria-label", timeout=3000)
                href = link.get_attribute("href", timeout=3000) or ""

                name = "N/A"
                price = "N/A"
                brand = "N/A"

                if aria_label:
                    # aria-label format: "Product Name, Price £XX.XX"
                    m = re.match(r"^(.+?),\\s*Price\\s+(.+)$", aria_label)
                    if m:
                        name = m.group(1).strip()
                        price = m.group(2).strip()

                # Extract brand from URL path: /brand-name/product-slug/prd/...
                if href:
                    brand_match = re.search(r"asos\\.com/([^/]+)/", href)
                    if brand_match:
                        brand = brand_match.group(1).replace("-", " ").title()

                if name == "N/A":
                    continue

                results.append({
                    "name": name,
                    "price": price,
                    "brand": brand,
                })
            except Exception:
                continue

        # ── Print results ─────────────────────────────────────────────────
        print(f"\\nFound {len(results)} products for '{query}':\\n")
        for i, product in enumerate(results, 1):
            print(f"  {i}. {product['name']}")
            print(f"     Brand: {product['brand']}")
            print(f"     Price: {product['price']}")
            print()

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

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  ASOS.com – Product Search");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  📝 Query: ${CFG.query}`);
  console.log(`  📊 Max results: ${CFG.maxResults}\n`);

  const recorder = new PlaywrightRecorder();
  const llmClient = setupLLMClient("hybrid");
  let stagehand;

  try {
    stagehand = new Stagehand({
      env: "LOCAL", verbose: 0, llmClient,
      localBrowserLaunchOptions: {
        headless: false,
        viewport: { width: 1920, height: 1080 },
        args: ["--disable-blink-features=AutomationControlled", "--start-maximized"],
      },
    });
    await stagehand.init();
    const page = stagehand.context.pages()[0];

    // Navigate directly to search results
    const searchQuery = CFG.query.replace(/ /g, "+");
    const searchUrl = `${CFG.url}/search/?q=${searchQuery}`;
    console.log(`🌐 Loading ${searchUrl}...`);
    recorder.goto(searchUrl);
    await page.goto(searchUrl);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(CFG.waits.search);
    console.log("✅ Loaded\n");

    // Extract using AI
    const { z } = require("zod/v3");
    const listings = await stagehand.extract(
      `Extract up to ${CFG.maxResults} product results. For each product, get the product name, price, and brand.`,
      z.object({
        products: z.array(z.object({
          name: z.string().describe("Product name"),
          price: z.string().describe("Price, e.g. '£40.00'"),
          brand: z.string().describe("Brand name"),
        })).describe(`Up to ${CFG.maxResults} products`),
      })
    );

    recorder.record("extract", {
      instruction: "Extract product search results",
      description: `Extract up to ${CFG.maxResults} products`,
      results: listings,
    });

    console.log(`📋 Found ${listings.products.length} products:`);
    listings.products.forEach((p, i) => {
      console.log(`   ${i + 1}. ${p.name}`);
      console.log(`      Brand: ${p.brand}  Price: ${p.price}`);
    });

    // Save Python + JSON
    const pyScript = genPython(CFG, recorder);
    const pyPath = path.join(__dirname, "asos_search.py");
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
      fs.writeFileSync(path.join(__dirname, "asos_search.py"), pyScript, "utf-8");
      console.log("⚠️  Partial Python saved");
    }
    throw err;
  } finally {
    if (stagehand) await stagehand.close();
  }
}

if (require.main === module) {
  main().then(() => { console.log("🎊 Done!"); process.exit(0); }).catch((e) => { console.error("💥", e.message); process.exit(1); });
}
module.exports = { main };
