const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Backcountry – Search for outdoor gear products
 */

const CFG = {
  searchQuery: "hiking boots",
  maxResults: 5,
  waits: { page: 5000, action: 2000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Backcountry – Search for outdoor gear products

Generated on: ${ts}
Recorded ${n} browser interactions
"""

import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class BackcountrySearchRequest:
    search_query: str = "${cfg.searchQuery}"
    max_results: int = ${cfg.maxResults}


@dataclass
class BackcountryProductItem:
    product_name: str = ""
    brand: str = ""
    price: str = ""
    original_price: str = ""
    rating: str = ""
    num_reviews: str = ""


@dataclass
class BackcountrySearchResult:
    items: List[BackcountryProductItem] = field(default_factory=list)


# Search for outdoor gear products on Backcountry.
def backcountry_search(page: Page, request: BackcountrySearchRequest) -> BackcountrySearchResult:
    """Search for outdoor gear products on Backcountry."""
    print(f"  Query: {request.search_query}\\n")

    query = request.search_query.replace(" ", "+")
    url = f"https://www.backcountry.com/search?q={query}"
    print(f"Loading {url}...")
    checkpoint("Navigate to Backcountry search results")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    result = BackcountrySearchResult()

    checkpoint("Extract product listings")
    js_code = """(max) => {
        const cards = document.querySelectorAll('[data-id="productListingItem"], [class*="product-listing"] li, [class*="ProductCard"], [class*="search-result"] article');
        const items = [];
        for (const card of cards) {
            if (items.length >= max) break;
            const nameEl = card.querySelector('[class*="product-name"], [class*="title"] a, h3 a, [data-id="productTitle"]');
            const brandEl = card.querySelector('[class*="brand"], [class*="Brand"], [data-id="productBrand"]');
            const priceEl = card.querySelector('[class*="sale-price"], [class*="Price"]:not([class*="original"]), [class*="current-price"]');
            const origPriceEl = card.querySelector('[class*="original-price"], [class*="compare-price"], s, del');
            const ratingEl = card.querySelector('[class*="rating"], [class*="stars"], [aria-label*="rating"]');
            const reviewsEl = card.querySelector('[class*="review-count"], [class*="reviews"], [class*="Rating"] span');

            const product_name = nameEl ? nameEl.textContent.trim() : '';
            const brand = brandEl ? brandEl.textContent.trim() : '';
            const price = priceEl ? priceEl.textContent.trim() : '';
            const original_price = origPriceEl ? origPriceEl.textContent.trim() : '';
            const rating = ratingEl ? (ratingEl.getAttribute('aria-label') || ratingEl.textContent.trim()) : '';
            const num_reviews = reviewsEl ? reviewsEl.textContent.trim().replace(/[^\\d]/g, '') : '';

            if (product_name) {
                items.push({product_name, brand, price, original_price, rating, num_reviews});
            }
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = BackcountryProductItem()
        item.product_name = d.get("product_name", "")
        item.brand = d.get("brand", "")
        item.price = d.get("price", "")
        item.original_price = d.get("original_price", "")
        item.rating = d.get("rating", "")
        item.num_reviews = d.get("num_reviews", "")
        result.items.append(item)

    for i, item in enumerate(result.items, 1):
        print(f"\\n  Product {i}:")
        print(f"    Name:     {item.product_name}")
        print(f"    Brand:    {item.brand}")
        print(f"    Price:    {item.price}")
        print(f"    Original: {item.original_price}")
        print(f"    Rating:   {item.rating}")
        print(f"    Reviews:  {item.num_reviews}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("backcountry")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            request = BackcountrySearchRequest()
            result = backcountry_search(page, request)
            print("\\n=== DONE ===")
            print(f"Found {len(result.items)} products")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
`;
}

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder(stagehand.page);
  const page = stagehand.page;

  try {
    const query = CFG.searchQuery.replace(/ /g, "+");
    const url = `https://www.backcountry.com/search?q=${query}`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    recorder.record("navigate", url, `Navigate to ${url}`);
    await page.waitForTimeout(CFG.waits.page);

    const data = await stagehand.extract(
      `Extract the first ${CFG.maxResults} product results. For each get the product name, brand, price, original price, rating, and number of reviews.`
    );
    recorder.record("extract", "product listings", JSON.stringify(data));
    console.log("Extracted:", JSON.stringify(data, null, 2));

    const outDir = __dirname;
    fs.writeFileSync(path.join(outDir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    fs.writeFileSync(path.join(outDir, "backcountry_search.py"), genPython(CFG, recorder));
    console.log("Saved backcountry_search.py");
  } finally {
    await stagehand.close();
  }
})();
