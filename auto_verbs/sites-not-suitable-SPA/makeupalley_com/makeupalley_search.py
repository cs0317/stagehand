"""
Playwright script (Python) — MakeupAlley Product Reviews
Search MakeupAlley for product reviews and extract details.
Note: MakeupAlley requires login to view product search results.
"""

import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class MakeupAlleyRequest:
    search_query: str = "mascara"
    max_results: int = 5


@dataclass
class ProductItem:
    name: str = ""
    brand: str = ""
    rating: str = ""
    reviews: str = ""
    repurchase: str = ""


@dataclass
class MakeupAlleyResult:
    query: str = ""
    products: List[ProductItem] = field(default_factory=list)


# Searches MakeupAlley for product reviews matching the query and returns
# up to max_results products with name, brand, rating, reviews, and repurchase percentage.
def search_makeupalley_products(page: Page, request: MakeupAlleyRequest) -> MakeupAlleyResult:
    import urllib.parse
    url = f"https://www.makeupalley.com/product/searching?product-name={urllib.parse.quote_plus(request.search_query)}"
    print(f"Loading {url}...")
    checkpoint("Navigate to MakeupAlley search")
    page.goto(url, wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(5000)

    result = MakeupAlleyResult(query=request.search_query)

    checkpoint("Extract product listings")
    js_code = """(max) => {
        const results = [];
        const rows = document.querySelectorAll('tr, [class*="product"], [class*="result"], li[class*="item"]');
        const seen = new Set();
        for (const row of rows) {
            if (results.length >= max) break;
            const nameEl = row.querySelector('a, [class*="name"], td:first-child');
            const name = nameEl ? nameEl.textContent.trim() : '';
            if (!name || name.length < 3 || seen.has(name)) continue;
            if (/sign in|log in|register|search/i.test(name)) continue;
            seen.add(name);

            let brand = '';
            const brandEl = row.querySelector('[class*="brand"], td:nth-child(2)');
            if (brandEl) brand = brandEl.textContent.trim();

            let rating = '';
            const ratingEl = row.querySelector('[class*="rating"], [class*="star"]');
            if (ratingEl) rating = ratingEl.textContent.trim();

            let reviews = '';
            const revEl = row.querySelector('[class*="review"], td:nth-child(4)');
            if (revEl) {
                const m = revEl.textContent.match(/(\\d+)/);
                if (m) reviews = m[1];
            }

            let repurchase = '';
            const repEl = row.querySelector('[class*="repurchase"], td:nth-child(5)');
            if (repEl) repurchase = repEl.textContent.trim();

            results.push({ name, brand, rating, reviews, repurchase });
        }
        return results;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = ProductItem()
        item.name = d.get("name", "")
        item.brand = d.get("brand", "")
        item.rating = d.get("rating", "")
        item.reviews = d.get("reviews", "")
        item.repurchase = d.get("repurchase", "")
        result.products.append(item)

    print(f"\nFound {len(result.products)} products for '{request.search_query}':")
    for i, item in enumerate(result.products, 1):
        print(f"\n  {i}. {item.brand} {item.name}")
        print(f"     Rating: {item.rating}  Reviews: {item.reviews}  Repurchase: {item.repurchase}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("makeupalley")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            result = search_makeupalley_products(page, MakeupAlleyRequest())
            print("\n=== DONE ===")
            print(f"Found {len(result.products)} products")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
