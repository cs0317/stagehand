const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Cabela's – Search for outdoor products
 */

const CFG = {
  searchQuery: "fishing rod",
  maxResults: 5,
  waits: { page: 5000, action: 2000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Cabela's – Search for outdoor products

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
class CabelasSearchRequest:
    search_query: str = "${cfg.searchQuery}"
    max_results: int = ${cfg.maxResults}


@dataclass
class CabelasProductItem:
    product_name: str = ""
    brand: str = ""
    price: str = ""
    original_price: str = ""
    rating: str = ""
    num_reviews: str = ""


@dataclass
class CabelasSearchResult:
    items: List[CabelasProductItem] = field(default_factory=list)


# Search for outdoor products on Cabela's.
def cabelas_search(page: Page, request: CabelasSearchRequest) -> CabelasSearchResult:
    """Search for outdoor products on Cabela's."""
    print(f"  Query: {request.search_query}")
    print(f"  Max results: {request.max_results}\\n")

    import urllib.parse
    encoded = urllib.parse.quote_plus(request.search_query)
    url = f"https://www.cabelas.com/shop/SearchDisplay?searchTerm={encoded}"
    print(f"Loading {url}...")
    checkpoint("Navigate to Cabela's search results")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    result = CabelasSearchResult()

    checkpoint("Extract product listings")
    js_code = """(max) => {
        const cards = document.querySelectorAll('[class*="product"], [class*="Product"], [data-testid*="product"], .product-card, article');
        const items = [];
        for (const card of cards) {
            if (items.length >= max) break;

            const nameEl = card.querySelector('[class*="product-name"], [class*="ProductName"], h3, h2, a[class*="name"]');
            const name = nameEl ? nameEl.textContent.trim() : '';
            if (!name) continue;

            const brandEl = card.querySelector('[class*="brand"], [class*="Brand"]');
            const brand = brandEl ? brandEl.textContent.trim() : '';

            const priceEl = card.querySelector('[class*="sale-price"], [class*="SalePrice"], [class*="price"]:not([class*="original"]):not([class*="was"])');
            const price = priceEl ? priceEl.textContent.trim() : '';

            const origEl = card.querySelector('[class*="original-price"], [class*="was-price"], [class*="OriginalPrice"], s, del');
            const originalPrice = origEl ? origEl.textContent.trim() : '';

            const ratingEl = card.querySelector('[class*="rating"], [class*="star"], [aria-label*="star"], [aria-label*="rating"]');
            const rating = ratingEl ? (ratingEl.getAttribute('aria-label') || ratingEl.textContent).trim() : '';

            const reviewEl = card.querySelector('[class*="review-count"], [class*="ReviewCount"], [class*="reviews"]');
            const numReviews = reviewEl ? reviewEl.textContent.trim().replace(/[()]/g, '') : '';

            items.push({
                product_name: name,
                brand: brand,
                price: price,
                original_price: originalPrice,
                rating: rating,
                num_reviews: numReviews
            });
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = CabelasProductItem()
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
    profile_dir = get_temp_profile_dir("cabelas")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            request = CabelasSearchRequest()
            result = cabelas_search(page, request)
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
    const encoded = encodeURIComponent(CFG.searchQuery);
    const url = `https://www.cabelas.com/shop/SearchDisplay?searchTerm=${encoded}`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    recorder.record("navigate", url, `Navigate to ${url}`);
    await page.waitForTimeout(CFG.waits.page);

    const data = await stagehand.extract(
      `Extract the top ${CFG.maxResults} product listings. For each get the product name, brand, price, original price, rating, and number of reviews.`
    );
    recorder.record("extract", "product listings", JSON.stringify(data));
    console.log("Extracted:", JSON.stringify(data, null, 2));

    const outDir = __dirname;
    fs.writeFileSync(path.join(outDir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    fs.writeFileSync(path.join(outDir, "cabelas_search.py"), genPython(CFG, recorder));
    console.log("Saved cabelas_search.py");
  } finally {
    await stagehand.close();
  }
})();
