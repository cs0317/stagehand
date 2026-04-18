const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Ace Hardware – Product Search
 *
 * Searches acehardware.com for products matching a query and extracts
 * product name, brand, price, and product URL.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  query: "LED light bulbs",
  maxResults: 5,
  waits: { page: 5000 },
};

// ── Python Script Generator ──────────────────────────────────────────────────
function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Ace Hardware – Product Search
Query: "${cfg.query}"

Generated on: ${ts}
Recorded ${n} browser interactions

Uses Playwright's native locator API with the user's Chrome profile.
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
class ProductSearchRequest:
    query: str = "${cfg.query}"
    max_results: int = ${cfg.maxResults}


@dataclass
class Product:
    product_name: str = ""
    brand: str = ""
    price: str = ""
    product_url: str = ""


@dataclass
class ProductSearchResult:
    products: list = field(default_factory=list)


def acehardware_search(page: Page, request: ProductSearchRequest) -> ProductSearchResult:
    """Search Ace Hardware for products."""
    print(f"  Query: {request.query}\\n")

    # ── Navigate to search results ────────────────────────────────────
    search_url = f"https://www.acehardware.com/search?query={quote_plus(request.query)}"
    print(f"Loading {search_url}...")
    checkpoint("Navigate to Ace Hardware search")
    page.goto(search_url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    # ── Dismiss popups ────────────────────────────────────────────────
    for sel in [
        "button#onetrust-accept-btn-handler",
        "button:has-text('Accept All')",
        "button:has-text('Accept')",
        "button[aria-label='Close']",
    ]:
        try:
            btn = page.locator(sel).first
            if btn.is_visible(timeout=2000):
                btn.click()
                page.wait_for_timeout(500)
        except Exception:
            pass

    # ── Extract products ──────────────────────────────────────────────
    checkpoint("Extract product listings")
    products = page.evaluate(r"""(maxResults) => {
        const results = [];
        const cards = document.querySelectorAll(
            '[data-testid="product-card"], ' +
            '.product-card, ' +
            '.product-wrap, ' +
            '[class*="ProductCard"], ' +
            '.search-results .product'
        );
        for (const card of cards) {
            if (results.length >= maxResults) break;
            const nameEl = card.querySelector(
                '[data-testid="product-name"], .product-name, h3, h4, .product-title, a'
            );
            const priceEl = card.querySelector(
                '[data-testid="price"], .product-price, [class*="price"]'
            );
            const brandEl = card.querySelector(
                '[data-testid="brand"], .product-brand, [class*="brand"]'
            );
            const linkEl = card.querySelector('a[href*="/product/"]') || card.querySelector('a');
            const name = nameEl ? nameEl.innerText.trim() : '';
            let price = '';
            if (priceEl) {
                const pm = priceEl.innerText.trim().match(/\\$[\\d,.]+/);
                price = pm ? pm[0] : priceEl.innerText.trim();
            }
            const brand = brandEl ? brandEl.innerText.trim() : '';
            const url = linkEl ? linkEl.href : '';
            if (name) {
                results.push({ product_name: name, brand, price, product_url: url });
            }
        }
        if (results.length === 0) {
            const links = document.querySelectorAll('a[href*="/product/"]');
            for (const link of links) {
                if (results.length >= maxResults) break;
                const text = link.innerText.trim();
                if (text && text.length > 5 && text.length < 200) {
                    results.push({
                        product_name: text, brand: '', price: '', product_url: link.href,
                    });
                }
            }
        }
        return results;
    }""", request.max_results)

    # ── Print results ─────────────────────────────────────────────────
    print("\\n" + "=" * 60)
    print(f"Ace Hardware: {request.query}")
    print("=" * 60)
    for idx, p in enumerate(products, 1):
        print(f"\\n  {idx}. {p['product_name']}")
        print(f"     Brand: {p['brand']}")
        print(f"     Price: {p['price']}")
        print(f"     URL: {p['product_url']}")

    result_products = [Product(**p) for p in products]
    print(f"\\nFound {len(result_products)} products")
    return ProductSearchResult(products=result_products)


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("acehardware_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = acehardware_search(page, ProductSearchRequest())
            print(f"\\nReturned {len(result.products)} products")
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
    const searchUrl = `https://www.acehardware.com/search?query=${encodeURIComponent(CFG.query)}`;
    console.log(`\n🌐 Searching: ${searchUrl}...`);
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url: searchUrl, description: "Search Ace Hardware" });

    // Dismiss popups
    for (const sel of [
      "button#onetrust-accept-btn-handler",
      "button:has-text('Accept All')",
    ]) {
      try {
        const btn = page.locator(sel).first();
        if (await btn.isVisible({ timeout: 2000 })) {
          await btn.click();
          await page.waitForTimeout(500);
        }
      } catch (e) { /* no banner */ }
    }

    // Extract products
    const products = await page.evaluate((maxResults) => {
      const results = [];
      const cards = document.querySelectorAll(
        '[data-testid="product-card"], .product-card, .product-wrap, [class*="ProductCard"]'
      );
      for (const card of cards) {
        if (results.length >= maxResults) break;
        const nameEl = card.querySelector('[data-testid="product-name"], .product-name, h3, h4, a');
        const priceEl = card.querySelector('[data-testid="price"], .product-price, [class*="price"]');
        const brandEl = card.querySelector('[data-testid="brand"], .product-brand, [class*="brand"]');
        const linkEl = card.querySelector('a[href*="/product/"]') || card.querySelector("a");
        const name = nameEl ? nameEl.innerText.trim() : "";
        let price = "";
        if (priceEl) {
          const pm = priceEl.innerText.trim().match(/\$[\d,.]+/);
          price = pm ? pm[0] : priceEl.innerText.trim();
        }
        const brand = brandEl ? brandEl.innerText.trim() : "";
        const url = linkEl ? linkEl.href : "";
        if (name) results.push({ product_name: name, brand, price, product_url: url });
      }
      if (results.length === 0) {
        const links = document.querySelectorAll('a[href*="/product/"]');
        for (const link of links) {
          if (results.length >= maxResults) break;
          const text = link.innerText.trim();
          if (text && text.length > 5 && text.length < 200)
            results.push({ product_name: text, brand: "", price: "", product_url: link.href });
        }
      }
      return results;
    }, CFG.maxResults);

    recorder.record("extract", {
      instruction: "Extract product search results",
      description: `Extracted ${products.length} products`,
      results: products,
    });

    console.log("\n" + "=".repeat(60));
    console.log(`Ace Hardware: ${CFG.query}`);
    console.log("=".repeat(60));
    products.forEach((p, i) => {
      console.log(`\n  ${i + 1}. ${p.product_name}`);
      console.log(`     Brand: ${p.brand}`);
      console.log(`     Price: ${p.price}`);
      console.log(`     URL: ${p.product_url}`);
    });

    const dir = path.join(__dirname);
    fs.writeFileSync(
      path.join(dir, "recorded_actions.json"),
      JSON.stringify(recorder.actions, null, 2)
    );
    console.log(`\n💾 Saved ${recorder.actions.length} actions`);

    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(dir, "acehardware_search.py"), pyCode);
    console.log("🐍 Saved Python script");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
