"""
Playwright script (Python) — Google Shopping Search
Search Google Shopping for products.
"""

import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class GoogleShoppingRequest:
    search_query: str = "wireless headphones"
    max_results: int = 5


@dataclass
class ProductItem:
    name: str = ""
    price: str = ""
    store: str = ""
    rating: str = ""
    reviews: str = ""


@dataclass
class GoogleShoppingResult:
    query: str = ""
    items: List[ProductItem] = field(default_factory=list)


# Searches Google Shopping for products matching the query and returns
# up to max_results products with name, price, store, rating, and review count.
def search_google_shopping(page: Page, request: GoogleShoppingRequest) -> GoogleShoppingResult:
    import urllib.parse
    url = f"https://www.google.com/search?tbm=shop&q={urllib.parse.quote_plus(request.search_query)}"
    print(f"Loading {url}...")
    checkpoint("Navigate to shopping results")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    result = GoogleShoppingResult(query=request.search_query)

    checkpoint("Extract product listings")
    js_code = """(max) => {
        const results = [];
        const cards = document.querySelectorAll('[class*="sh-dgr__content"], [class*="sh-dlr__list-result"], [data-docid], [class*="product"]');
        for (const card of cards) {
            if (results.length >= max) break;

            const nameEl = card.querySelector('h3, h4, [class*="tAxDx"], a[class*="translate-content"]');
            const name = nameEl ? nameEl.textContent.trim() : '';
            if (!name || name.length < 5) continue;
            if (results.some(r => r.name === name)) continue;

            let price = '';
            const priceEl = card.querySelector('[class*="a8Pemb"], [class*="price"], b');
            if (priceEl) price = priceEl.textContent.trim();

            let store = '';
            const storeEl = card.querySelector('[class*="aULzUe"], [class*="merchant"], [class*="store"]');
            if (storeEl) store = storeEl.textContent.trim();

            let rating = '';
            const ratingEl = card.querySelector('[class*="Rsc7Yb"], [aria-label*="stars"], [class*="rating"]');
            if (ratingEl) {
                const ariaLabel = ratingEl.getAttribute('aria-label') || '';
                const rateMatch = ariaLabel.match(/([\\d.]+)/);
                if (rateMatch) rating = rateMatch[1];
                if (!rating) rating = ratingEl.textContent.trim();
            }

            let reviews = '';
            const reviewEl = card.querySelector('[class*="qIEPib"], [class*="review"]');
            if (reviewEl) {
                const revMatch = reviewEl.textContent.match(/([\\d,]+)/);
                if (revMatch) reviews = revMatch[1];
            }

            results.push({ name, price, store, rating, reviews });
        }
        return results;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = ProductItem()
        item.name = d.get("name", "")
        item.price = d.get("price", "")
        item.store = d.get("store", "")
        item.rating = d.get("rating", "")
        item.reviews = d.get("reviews", "")
        result.items.append(item)

    print(f"\nFound {len(result.items)} products for '{request.search_query}':")
    for i, item in enumerate(result.items, 1):
        print(f"\n  {i}. {item.name}")
        print(f"     Price: {item.price}  Store: {item.store}")
        print(f"     Rating: {item.rating}  Reviews: {item.reviews}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("gshopping")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            result = search_google_shopping(page, GoogleShoppingRequest())
            print("\n=== DONE ===")
            print(f"Found {len(result.items)} products")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
