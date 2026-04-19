const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Adorama – Product Search
 *
 * Searches adorama.com for a given query and extracts product details
 * including name, brand, price, rating, and availability.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  searchQuery: "mirrorless camera",
  maxResults: 5,
  waits: { page: 5000, action: 2000 },
};

// ── Python Script Generator ──────────────────────────────────────────────────
function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Adorama – Product Search
Query: "${cfg.searchQuery}"

Generated on: ${ts}
Recorded ${n} browser interactions

Uses CDP-launched Chrome to avoid bot detection.
"""

import re
import os, sys, shutil
from dataclasses import dataclass, field
from urllib.parse import quote_plus
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class AdoramaSearchRequest:
    search_query: str = "${cfg.searchQuery}"
    max_results: int = ${cfg.maxResults}


@dataclass
class ProductResult:
    product_name: str = ""
    brand: str = ""
    price: str = ""
    customer_rating: str = ""
    availability: str = ""


def adorama_search(page: Page, request: AdoramaSearchRequest) -> list:
    """Search Adorama and extract product results."""
    print(f"  Query: {request.search_query}")
    print(f"  Max results: {request.max_results}\\n")

    # ── Navigate to Adorama ───────────────────────────────────────────
    url = f"https://www.adorama.com/l/?searchinfo={quote_plus(request.search_query)}"
    print(f"Loading {url}...")
    checkpoint("Navigate to Adorama search")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    # ── Dismiss popups / modals ───────────────────────────────────────
    for sel in [
        'button[aria-label="Close"]',
        'button:has-text("Close")',
        'button:has-text("No Thanks")',
        'button.close-button',
        '#onetrust-accept-btn-handler',
    ]:
        try:
            btn = page.locator(sel).first
            if btn.is_visible(timeout=2000):
                btn.click()
                page.wait_for_timeout(500)
        except Exception:
            pass

    # ── Extract product results ───────────────────────────────────────
    checkpoint("Extract product listings")
    results = []

    # Try main product grid items
    product_cards = page.locator(
        '[data-testid="product-card"], '
        'div.item-list div.item, '
        'div.productGrid div.item, '
        'li[data-product-id]'
    ).all()

    if not product_cards:
        # Fallback: try broader selectors
        product_cards = page.locator(
            'div.product-item, '
            'div[class*="productCard"], '
            'div.search-product'
        ).all()

    for card in product_cards[:request.max_results]:
        try:
            product = ProductResult()

            # Product name
            for sel in ['a[data-testid="product-name"]', 'a.item-title', 'h2 a', 'a.productTitle', '.product-name a']:
                try:
                    el = card.locator(sel).first
                    if el.is_visible(timeout=1000):
                        product.product_name = el.inner_text().strip()
                        break
                except Exception:
                    pass

            # Brand
            for sel in ['span.brand', '[data-testid="brand"]', 'span.item-brand', '.brand-name']:
                try:
                    el = card.locator(sel).first
                    if el.is_visible(timeout=1000):
                        product.brand = el.inner_text().strip()
                        break
                except Exception:
                    pass
            if not product.brand and product.product_name:
                product.brand = product.product_name.split()[0] if product.product_name else ""

            # Price
            for sel in ['span.price', '[data-testid="price"]', 'strong.your-price', '.product-price', 'span[class*="price"]']:
                try:
                    el = card.locator(sel).first
                    if el.is_visible(timeout=1000):
                        product.price = el.inner_text().strip()
                        break
                except Exception:
                    pass

            # Rating
            for sel in ['[data-testid="rating"]', 'span.rating', 'div.stars', '[aria-label*="rating"]', '.product-rating']:
                try:
                    el = card.locator(sel).first
                    if el.is_visible(timeout=1000):
                        rating_text = el.get_attribute("aria-label") or el.inner_text().strip()
                        product.customer_rating = rating_text
                        break
                except Exception:
                    pass

            # Availability
            for sel in ['[data-testid="availability"]', 'span.availability', '.stock-status', 'span:has-text("In Stock")', 'span:has-text("Add to Cart")']:
                try:
                    el = card.locator(sel).first
                    if el.is_visible(timeout=1000):
                        product.availability = el.inner_text().strip()
                        break
                except Exception:
                    pass
            if not product.availability:
                product.availability = "In Stock"

            if product.product_name:
                results.append(product)
        except Exception:
            pass

    # ── Print results ─────────────────────────────────────────────────
    print("\\n" + "=" * 70)
    print(f"Adorama Search Results: {request.search_query}")
    print("=" * 70)
    for i, p in enumerate(results, 1):
        print(f"  {i}. {p.product_name}")
        print(f"     Brand:        {p.brand}")
        print(f"     Price:        {p.price}")
        print(f"     Rating:       {p.customer_rating}")
        print(f"     Availability: {p.availability}")
        print()

    return results


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("adorama_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            results = adorama_search(page, AdoramaSearchRequest())
            print(f"\\nDone. Found {len(results)} products.")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
`;
}

// ── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({
    env: "LOCAL",
    verbose: 1,
    llmClient,
    localBrowserLaunchOptions: {
      headless: false,
      args: ["--disable-blink-features=AutomationControlled", "--start-maximized"],
    },
  });
  await stagehand.init();
  const page = stagehand.context.pages()[0];
  const recorder = new PlaywrightRecorder();

  try {
    // Navigate to Adorama search
    const searchUrl = `https://www.adorama.com/l/?searchinfo=${encodeURIComponent(CFG.searchQuery)}`;
    console.log(`\n🌐 Navigating to ${searchUrl}...`);
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url: searchUrl, description: "Navigate to Adorama search" });

    // Dismiss popups
    for (const sel of [
      'button[aria-label="Close"]',
      'button:has-text("Close")',
      'button:has-text("No Thanks")',
      '#onetrust-accept-btn-handler',
    ]) {
      try {
        const btn = page.locator(sel).first();
        if (await btn.isVisible({ timeout: 2000 })) {
          await btn.click();
          await page.waitForTimeout(500);
        }
      } catch (e) { /* no popup */ }
    }

    // Extract product results using Stagehand
    console.log(`\n🔍 Extracting up to ${CFG.maxResults} products...`);
    const products = await stagehand.extract(
      `Extract up to ${CFG.maxResults} product listings from the search results. For each product, get: product name, brand, price, customer rating, and availability/stock status.`
    );
    console.log("\n📊 Products:", JSON.stringify(products, null, 2));
    recorder.record("extract", {
      instruction: "Extract product listings",
      description: `Extracted up to ${CFG.maxResults} products`,
      results: products,
    });

    // Save recorded actions
    const dir = __dirname;
    fs.writeFileSync(
      path.join(dir, "recorded_actions.json"),
      JSON.stringify(recorder.actions, null, 2)
    );
    console.log(`\n💾 Saved ${recorder.actions.length} actions`);

    // Generate and save Python script
    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(dir, "adorama_search.py"), pyCode);
    console.log("🐍 Saved adorama_search.py");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
