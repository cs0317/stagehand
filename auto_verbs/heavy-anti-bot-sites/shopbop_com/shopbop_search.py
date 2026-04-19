"""
Shopbop – Search for fashion products

Uses CDP-launched Chrome to avoid bot detection.
"""

import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class ShopbopSearchRequest:
    search_query: str = "handbag"
    max_results: int = 5


@dataclass
class ShopbopProductItem:
    product_name: str = ""
    brand: str = ""
    price: str = ""
    original_price: str = ""
    discount: str = ""


@dataclass
class ShopbopSearchResult:
    items: List[ShopbopProductItem] = field(default_factory=list)


# Search for fashion products on Shopbop.
def shopbop_search(page: Page, request: ShopbopSearchRequest) -> ShopbopSearchResult:
    """Search for fashion products on Shopbop."""
    print(f"  Query: {request.search_query}\n")

    query = request.search_query.replace(" ", "+")
    url = f"https://www.shopbop.com/s?searchTerm={query}"
    print(f"Loading {url}...")
    checkpoint("Navigate to Shopbop search results")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    result = ShopbopSearchResult()

    checkpoint("Extract product listings")
    js_code = """(max) => {
        const cards = document.querySelectorAll('[class*="product-card"], [class*="ProductCard"], [class*="search-result"] article, [class*="product-list"] li, [data-test*="product"]');
        const items = [];
        for (const card of cards) {
            if (items.length >= max) break;
            const nameEl = card.querySelector('[class*="product-name"], [class*="ProductName"], [class*="title"] a, h3 a');
            const brandEl = card.querySelector('[class*="brand"], [class*="Brand"], [class*="designer"]');
            const priceEl = card.querySelector('[class*="sale-price"], [class*="Price"]:not([class*="original"]):not([class*="was"]), [class*="current-price"]');
            const origPriceEl = card.querySelector('[class*="original-price"], [class*="was-price"], [class*="compare-price"], s, del');
            const discountEl = card.querySelector('[class*="discount"], [class*="percent-off"], [class*="savings"], [class*="badge"]');

            const product_name = nameEl ? nameEl.textContent.trim() : '';
            const brand = brandEl ? brandEl.textContent.trim() : '';
            const price = priceEl ? priceEl.textContent.trim() : '';
            const original_price = origPriceEl ? origPriceEl.textContent.trim() : '';
            const discount = discountEl ? discountEl.textContent.trim() : '';

            if (product_name) {
                items.push({product_name, brand, price, original_price, discount});
            }
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = ShopbopProductItem()
        item.product_name = d.get("product_name", "")
        item.brand = d.get("brand", "")
        item.price = d.get("price", "")
        item.original_price = d.get("original_price", "")
        item.discount = d.get("discount", "")
        result.items.append(item)

    for i, item in enumerate(result.items, 1):
        print(f"\n  Product {i}:")
        print(f"    Name:     {item.product_name}")
        print(f"    Brand:    {item.brand}")
        print(f"    Price:    {item.price}")
        print(f"    Original: {item.original_price}")
        print(f"    Discount: {item.discount}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("shopbop")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            request = ShopbopSearchRequest()
            result = shopbop_search(page, request)
            print("\n=== DONE ===")
            print(f"Found {len(result.items)} products")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
