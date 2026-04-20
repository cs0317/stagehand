"""
Playwright script (Python) — JOANN Product Search
Search JOANN for craft/fabric supplies.
"""

import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class JoannRequest:
    search_query: str = "quilting fabric"
    max_results: int = 5


@dataclass
class ProductItem:
    name: str = ""
    price: str = ""
    price_per_yard: str = ""
    material: str = ""
    rating: str = ""


@dataclass
class JoannResult:
    query: str = ""
    items: List[ProductItem] = field(default_factory=list)


def search_joann(page: Page, request: JoannRequest) -> JoannResult:
    import urllib.parse
    url = f"https://www.joann.com/search?q={urllib.parse.quote_plus(request.search_query)}"
    print(f"Loading {url}...")
    checkpoint("Navigate to search results")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    result = JoannResult(query=request.search_query)

    checkpoint("Extract product listings")
    js_code = """(max) => {
        const results = [];
        const cards = document.querySelectorAll('[class*="product-tile"], [class*="product-card"], [data-product-id], article');
        for (const card of cards) {
            if (results.length >= max) break;
            const nameEl = card.querySelector('[class*="product-name"], h3, h2, a[class*="name"], [class*="title"]');
            const name = nameEl ? nameEl.textContent.trim() : '';
            if (!name || name.length < 5) continue;
            if (results.some(r => r.name === name)) continue;

            let price = '';
            const priceEl = card.querySelector('[class*="price"], [class*="Price"]');
            if (priceEl) price = priceEl.textContent.trim();

            const text = (card.textContent || '').replace(/\\s+/g, ' ');

            let pricePerYard = '';
            const yardMatch = text.match(/\\$[\\d.]+\\s*(?:\\/\\s*yd|per\\s*yard)/i);
            if (yardMatch) pricePerYard = yardMatch[0];

            let material = '';
            const matMatch = text.match(/(cotton|polyester|linen|silk|flannel|muslin|broadcloth)/i);
            if (matMatch) material = matMatch[1];

            let rating = '';
            const ratingEl = card.querySelector('[class*="rating"], [class*="star"], [aria-label*="star"]');
            if (ratingEl) {
                const ariaLabel = ratingEl.getAttribute('aria-label') || '';
                const rateMatch = ariaLabel.match(/([\\d.]+)/);
                if (rateMatch) rating = rateMatch[1];
                if (!rating) rating = ratingEl.textContent.trim();
            }

            results.push({ name, price, price_per_yard: pricePerYard, material, rating });
        }
        return results;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = ProductItem()
        item.name = d.get("name", "")
        item.price = d.get("price", "")
        item.price_per_yard = d.get("price_per_yard", "")
        item.material = d.get("material", "")
        item.rating = d.get("rating", "")
        result.items.append(item)

    print(f"\nFound {len(result.items)} products for '{request.search_query}':")
    for i, item in enumerate(result.items, 1):
        print(f"\n  {i}. {item.name}")
        print(f"     Price: {item.price}  Per Yard: {item.price_per_yard}")
        print(f"     Material: {item.material}  Rating: {item.rating}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("joann")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            result = search_joann(page, JoannRequest())
            print("\n=== DONE ===")
            print(f"Found {len(result.items)} products")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
