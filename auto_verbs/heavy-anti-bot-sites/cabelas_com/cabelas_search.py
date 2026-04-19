"""
Cabela's – Search for outdoor products

Uses CDP-launched Chrome to avoid bot detection.
"""

import os, sys, shutil
import urllib.parse
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class CabelasSearchRequest:
    search_query: str = "fishing rod"
    max_results: int = 5


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
    print(f"  Max results: {request.max_results}\n")

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
        print(f"\n  Product {i}:")
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
            print("\n=== DONE ===")
            print(f"Found {len(result.items)} products")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
