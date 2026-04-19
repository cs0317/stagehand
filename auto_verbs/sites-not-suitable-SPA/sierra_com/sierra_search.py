"""
Sierra – Search for outdoor and active products

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
class SierraSearchRequest:
    search_query: str = "hiking jacket"
    max_results: int = 5


@dataclass
class SierraProductItem:
    product_name: str = ""
    brand: str = ""
    price: str = ""
    original_price: str = ""
    discount_percentage: str = ""


@dataclass
class SierraSearchResult:
    items: List[SierraProductItem] = field(default_factory=list)


# Search for outdoor and active products on Sierra.
def sierra_search(page: Page, request: SierraSearchRequest) -> SierraSearchResult:
    """Search for outdoor and active products on Sierra."""
    print(f"  Query: {request.search_query}\n")

    query = request.search_query.replace(" ", "+")
    url = f"https://www.sierra.com/s~{request.search_query.replace(' ', '~')}/"
    print(f"Loading {url}...")
    checkpoint("Navigate to Sierra search results")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    result = SierraSearchResult()

    checkpoint("Extract product listings")
    js_code = """(max) => {
        const links = document.querySelectorAll('a[href]');
        const items = [];
        const seen = new Set();
        for (const a of links) {
            if (items.length >= max) break;
            const href = a.getAttribute('href') || '';
            // Product links typically end with a product ID pattern
            if (!href.match(/\\/\\d{5,}\\//)) continue;
            const text = a.textContent.trim();
            if (!text || text.length < 5 || text.length > 200) continue;
            if (seen.has(href)) continue;
            seen.add(href);
            items.push({product_name: text, brand: '', price: '', original_price: '', discount_percentage: ''});
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = SierraProductItem()
        item.product_name = d.get("product_name", "")
        item.brand = d.get("brand", "")
        item.price = d.get("price", "")
        item.original_price = d.get("original_price", "")
        item.discount_percentage = d.get("discount_percentage", "")
        result.items.append(item)

    for i, item in enumerate(result.items, 1):
        print(f"\n  Product {i}:")
        print(f"    Name:     {item.product_name}")
        print(f"    Brand:    {item.brand}")
        print(f"    Price:    {item.price}")
        print(f"    Original: {item.original_price}")
        print(f"    Discount: {item.discount_percentage}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("sierra")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            request = SierraSearchRequest()
            result = sierra_search(page, request)
            print("\n=== DONE ===")
            print(f"Found {len(result.items)} products")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
