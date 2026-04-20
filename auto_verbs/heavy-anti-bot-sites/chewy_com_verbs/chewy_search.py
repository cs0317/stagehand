"""
Playwright script (Python) — Chewy Search
Search for pet products on Chewy.
"""

import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from urllib.parse import quote_plus
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class ChewySearchRequest:
    query: str = "dog food grain-free"
    max_results: int = 5


@dataclass
class ProductItem:
    name: str = ""
    brand: str = ""
    price: str = ""
    size: str = ""
    rating: str = ""
    num_reviews: str = ""


@dataclass
class ChewySearchResult:
    query: str = ""
    items: List[ProductItem] = field(default_factory=list)


def search_chewy(page: Page, request: ChewySearchRequest) -> ChewySearchResult:
    """Search Chewy for pet products."""
    encoded = quote_plus(request.query)
    url = f"https://www.chewy.com/s?query={encoded}"
    print(f"Loading {url}...")
    checkpoint("Navigate to search")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(6000)

    result = ChewySearchResult(query=request.query)

    checkpoint("Extract products")
    js_code = """(max) => {
        const items = [];
        const cards = document.querySelectorAll('[class*="product"], [class*="card"], article, [data-testid*="product"]');
        for (const card of cards) {
            if (items.length >= max) break;
            const text = (card.textContent || '').replace(/\\s+/g, ' ').trim();

            let name = '';
            const nameEl = card.querySelector('[class*="title"] a, h2 a, h3 a, [data-testid*="title"]');
            if (nameEl) name = nameEl.textContent.trim();
            if (!name || name.length < 5 || name.length > 300) continue;
            if (items.some(i => i.name === name)) continue;

            let brand = '';
            const brandEl = card.querySelector('[class*="brand"]');
            if (brandEl) brand = brandEl.textContent.trim();

            let price = '';
            const priceMatch = text.match(/\\$[\\d,.]+/);
            if (priceMatch) price = priceMatch[0];

            let size = '';
            const sizeMatch = text.match(/(\\d+[\\d.]*\\s*(?:lb|oz|kg|g|ct|count|pack)s?)/i);
            if (sizeMatch) size = sizeMatch[0];

            let rating = '';
            const ratingMatch = text.match(/(\\d+\\.?\\d*)\\s*(?:out of|stars?|\\/)/i);
            if (ratingMatch) rating = ratingMatch[1];

            let reviews = '';
            const revMatch = text.match(/(\\d[\\d,]*)\\s*(?:review|rating)/i);
            if (revMatch) reviews = revMatch[1];

            items.push({name: name, brand: brand, price: price, size: size, rating: rating, num_reviews: reviews});
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = ProductItem()
        item.name = d.get("name", "")
        item.brand = d.get("brand", "")
        item.price = d.get("price", "")
        item.size = d.get("size", "")
        item.rating = d.get("rating", "")
        item.num_reviews = d.get("num_reviews", "")
        result.items.append(item)

    print(f"\nFound {len(result.items)} products for '{request.query}':")
    for i, item in enumerate(result.items, 1):
        print(f"\n  {i}. {item.name}")
        print(f"     Brand: {item.brand}  Price: {item.price}  Size: {item.size}  Rating: {item.rating}  Reviews: {item.num_reviews}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("chewy")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            result = search_chewy(page, ChewySearchRequest())
            print("\n=== DONE ===")
            print(f"Found {len(result.items)} products")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
