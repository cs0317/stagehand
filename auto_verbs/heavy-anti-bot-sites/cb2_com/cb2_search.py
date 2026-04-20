"""
Playwright script (Python) — CB2 Search
Search for furniture on CB2.
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
class CB2SearchRequest:
    query: str = "dining tables"
    max_results: int = 5


@dataclass
class ProductItem:
    name: str = ""
    price: str = ""
    dimensions: str = ""
    material: str = ""
    seating_capacity: str = ""


@dataclass
class CB2SearchResult:
    query: str = ""
    items: List[ProductItem] = field(default_factory=list)


def search_cb2(page: Page, request: CB2SearchRequest) -> CB2SearchResult:
    """Search CB2 for furniture products."""
    encoded = quote_plus(request.query)
    url = f"https://www.cb2.com/search?query={encoded}"
    print(f"Loading {url}...")
    checkpoint("Navigate to search")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(6000)

    result = CB2SearchResult(query=request.query)

    checkpoint("Extract products")
    js_code = """(max) => {
        const items = [];
        const cards = document.querySelectorAll('[class*="product"], [class*="card"], [class*="tile"], article');
        for (const card of cards) {
            if (items.length >= max) break;
            const text = (card.textContent || '').replace(/\\s+/g, ' ').trim();

            let name = '';
            const nameEl = card.querySelector('a[class*="name"], [class*="title"], h2, h3');
            if (nameEl) name = nameEl.textContent.trim();
            if (!name || name.length < 3 || name.length > 200) continue;
            if (items.some(i => i.name === name)) continue;

            let price = '';
            const priceMatch = text.match(/\\$[\\d,.]+/);
            if (priceMatch) price = priceMatch[0];

            let dimensions = '';
            const dimMatch = text.match(/(\\d+[\\d.]*["\\u201d]?\\s*[xX×]\\s*\\d+[\\d.]*["\\u201d]?(?:\\s*[xX×]\\s*\\d+[\\d.]*["\\u201d]?)?)/);
            if (dimMatch) dimensions = dimMatch[1];

            let material = '';
            const matMatch = text.match(/(wood|metal|glass|marble|oak|walnut|steel|concrete|stone|acacia)/i);
            if (matMatch) material = matMatch[1];

            let seating = '';
            const seatMatch = text.match(/(\\d+)\\s*(?:seat|person)/i);
            if (seatMatch) seating = seatMatch[1];

            items.push({name: name, price: price, dimensions: dimensions, material: material, seating_capacity: seating});
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = ProductItem()
        item.name = d.get("name", "")
        item.price = d.get("price", "")
        item.dimensions = d.get("dimensions", "")
        item.material = d.get("material", "")
        item.seating_capacity = d.get("seating_capacity", "")
        result.items.append(item)

    print(f"\nFound {len(result.items)} products for '{request.query}':")
    for i, item in enumerate(result.items, 1):
        print(f"\n  {i}. {item.name}")
        print(f"     Price: {item.price}  Dimensions: {item.dimensions}  Material: {item.material}  Seats: {item.seating_capacity}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("cb2")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            result = search_cb2(page, CB2SearchRequest())
            print("\n=== DONE ===")
            print(f"Found {len(result.items)} products")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
