const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Dick's Sporting Goods – Search for sporting goods products
 */

const CFG = {
  searchQuery: "running shoes",
  maxResults: 5,
  waits: { page: 5000, action: 2000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Dick's Sporting Goods – Search for sporting goods products

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
class DickssportinggoodsSearchRequest:
    search_query: str = "${cfg.searchQuery}"
    max_results: int = ${cfg.maxResults}


@dataclass
class DickssportinggoodsProductItem:
    product_name: str = ""
    brand: str = ""
    price: str = ""
    original_price: str = ""
    rating: str = ""
    num_reviews: str = ""


@dataclass
class DickssportinggoodsSearchResult:
    items: List[DickssportinggoodsProductItem] = field(default_factory=list)


# Search for sporting goods products on Dick's Sporting Goods.
def dickssportinggoods_search(page: Page, request: DickssportinggoodsSearchRequest) -> DickssportinggoodsSearchResult:
    """Search for sporting goods products on Dick's Sporting Goods."""
    print(f"  Query: {request.search_query}\\n")

    query = request.search_query.replace(" ", "+")
    url = f"https://www.dickssportinggoods.com/search/SearchDisplay?searchTerm={query}"
    print(f"Loading {url}...")
    checkpoint("Navigate to Dick's Sporting Goods search results")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    result = DickssportinggoodsSearchResult()

    checkpoint("Extract product listings")
    js_code = """(max) => {
        const cards = document.querySelectorAll('[class*="product-card"], [class*="ProductCard"], [class*="search-result"], [class*="product"], [data-testid*="product"]');
        const items = [];
        for (const card of cards) {
            if (items.length >= max) break;
            const nameEl = card.querySelector('[class*="product-name"], [class*="ProductName"], [class*="title"] a, h3 a, h2 a, a[class*="name"]');
            const brandEl = card.querySelector('[class*="brand"], [class*="Brand"], [class*="manufacturer"]');
            const priceEl = card.querySelector('[class*="sale-price"], [class*="current-price"], [class*="Price"]:not([class*="was"]), [class*="price"] span');
            const origPriceEl = card.querySelector('[class*="was-price"], [class*="original-price"], [class*="list-price"], del, s');
            const ratingEl = card.querySelector('[class*="rating"], [class*="stars"], [aria-label*="rating"], [aria-label*="star"]');
            const reviewEl = card.querySelector('[class*="review-count"], [class*="reviews"], [class*="count"]');

            const product_name = nameEl ? nameEl.textContent.trim() : '';
            const brand = brandEl ? brandEl.textContent.trim() : '';
            const price = priceEl ? priceEl.textContent.trim() : '';
            const original_price = origPriceEl ? origPriceEl.textContent.trim() : '';
            const rating = ratingEl ? (ratingEl.getAttribute('aria-label') || ratingEl.textContent.trim()) : '';
            const num_reviews = reviewEl ? reviewEl.textContent.trim().replace(/[()]/g, '') : '';

            if (product_name) {
                items.push({product_name, brand, price, original_price, rating, num_reviews});
            }
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = DickssportinggoodsProductItem()
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
    profile_dir = get_temp_profile_dir("dickssportinggoods")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            request = DickssportinggoodsSearchRequest()
            result = dickssportinggoods_search(page, request)
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
    const url = `https://www.dickssportinggoods.com/search/SearchDisplay?searchTerm=${query}`;
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
    fs.writeFileSync(path.join(outDir, "dickssportinggoods_search.py"), genPython(CFG, recorder));
    console.log("Saved dickssportinggoods_search.py");
  } finally {
    await stagehand.close();
  }
})();
