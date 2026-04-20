"""
Playwright script (Python) — Lowe's Product Search
Search Lowe's for products and extract details.
"""

import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class LowesRequest:
    search_query: str = "cordless drills"
    max_results: int = 5


@dataclass
class ProductItem:
    name: str = ""
    brand: str = ""
    price: str = ""
    voltage: str = ""
    rating: str = ""
    reviews: str = ""


@dataclass
class LowesResult:
    query: str = ""
    products: List[ProductItem] = field(default_factory=list)


# Searches Lowe's for products matching the query and returns
# up to max_results products with name, brand, price, voltage, rating, reviews.
def search_lowes_products(page: Page, request: LowesRequest) -> LowesResult:
    import urllib.parse
    url = f"https://www.lowes.com/search?searchTerm={urllib.parse.quote_plus(request.search_query)}"
    print(f"Loading {url}...")
    checkpoint("Navigate to Lowe's search")
    page.goto(url, wait_until="domcontentloaded", timeout=45000)
    page.wait_for_timeout(10000)

    result = LowesResult(query=request.search_query)

    checkpoint("Extract product listings")
    js_code = """(max) => {
        const results = [];
        // Lowe's product cards
        const cards = document.querySelectorAll('[data-testid*="product"], [class*="product-card"], [class*="ProductCard"], [class*="plp-card"]');
        const seen = new Set();
        for (const card of cards) {
            if (results.length >= max) break;
            const titleEl = card.querySelector('a[data-testid*="title"], h3 a, h2 a, a[class*="product-title"]');
            const name = titleEl ? titleEl.textContent.trim() : '';
            if (!name || name.length < 5 || seen.has(name)) continue;
            seen.add(name);

            let brand = '';
            const brandEl = card.querySelector('[class*="brand"], [data-testid*="brand"]');
            if (brandEl) brand = brandEl.textContent.trim();

            let price = '';
            const priceEl = card.querySelector('[class*="price"], [data-testid*="price"]');
            if (priceEl) price = priceEl.textContent.trim().split('\\n')[0];

            let voltage = '';
            const voltMatch = name.match(/(\\d+[- ]?volt)/i);
            if (voltMatch) voltage = voltMatch[1];

            let rating = '';
            const ratingEl = card.querySelector('[class*="rating"], [aria-label*="star"]');
            if (ratingEl) {
                const label = ratingEl.getAttribute('aria-label') || ratingEl.textContent.trim();
                const rMatch = label.match(/(\\d+\\.?\\d*)/);
                if (rMatch) rating = rMatch[1];
            }

            let reviews = '';
            const revEl = card.querySelector('[class*="review-count"], [class*="ratings"]');
            if (revEl) {
                const rMatch = revEl.textContent.match(/(\\d[\\d,]*)/);
                if (rMatch) reviews = rMatch[1];
            }

            results.push({ name, brand, price, voltage, rating, reviews });
        }
        return results;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = ProductItem()
        item.name = d.get("name", "")
        item.brand = d.get("brand", "")
        item.price = d.get("price", "")
        item.voltage = d.get("voltage", "")
        item.rating = d.get("rating", "")
        item.reviews = d.get("reviews", "")
        result.products.append(item)

    print(f"\nFound {len(result.products)} products for '{request.search_query}':")
    for i, item in enumerate(result.products, 1):
        print(f"\n  {i}. {item.brand} {item.name}")
        print(f"     Price: {item.price}  Voltage: {item.voltage}")
        print(f"     Rating: {item.rating}  Reviews: {item.reviews}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("lowes")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            result = search_lowes_products(page, LowesRequest())
            print("\n=== DONE ===")
            print(f"Found {len(result.products)} products")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
