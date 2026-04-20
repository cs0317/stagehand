"""
Playwright script (Python) — Etsy Shops Search
Search Etsy for shops by query.
"""

import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class EtsyShopsSearchRequest:
    search_query: str = "handmade jewelry"
    max_results: int = 5


@dataclass
class ShopItem:
    name: str = ""
    location: str = ""
    rating: str = ""
    sales: str = ""
    description: str = ""


@dataclass
class EtsyShopsSearchResult:
    query: str = ""
    items: List[ShopItem] = field(default_factory=list)


def search_etsy_shops(page: Page, request: EtsyShopsSearchRequest) -> EtsyShopsSearchResult:
    """Search Etsy for shops."""
    url = f"https://www.etsy.com/search?q={request.search_query.replace(' ', '+')}&ref=search_bar&search_type=shops"
    print(f"Loading {url}...")
    checkpoint("Navigate to search results")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    result = EtsyShopsSearchResult(query=request.search_query)

    checkpoint("Extract shops")
    js_code = """(max) => {
        const items = [];
        const cards = document.querySelectorAll('[data-search-results] .v2-listing-card, .shop-card, [class*="ShopCard"], [class*="shop-listing"]');
        for (const card of cards) {
            if (items.length >= max) break;
            const text = (card.textContent || '').replace(/\\s+/g, ' ').trim();
            const nameEl = card.querySelector('[class*="shop-name"], h3, h2, [class*="title"]');
            const name = nameEl ? nameEl.textContent.trim() : '';
            if (!name || name.length < 2) continue;
            if (items.some(r => r.name === name)) continue;

            let location = '';
            const locEl = card.querySelector('[class*="location"], [class*="address"]');
            if (locEl) location = locEl.textContent.trim();

            let rating = '';
            const ratingMatch = text.match(/(\\d\\.?\\d*)\\s*(?:stars?|out of)/i);
            if (ratingMatch) rating = ratingMatch[1];

            let sales = '';
            const salesMatch = text.match(/([\\d,]+)\\s*sales/i);
            if (salesMatch) sales = salesMatch[1];

            let desc = '';
            const descEl = card.querySelector('[class*="description"], p');
            if (descEl) desc = descEl.textContent.trim().substring(0, 200);

            items.push({name, location, rating, sales, description: desc});
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = ShopItem()
        item.name = d.get("name", "")
        item.location = d.get("location", "")
        item.rating = d.get("rating", "")
        item.sales = d.get("sales", "")
        item.description = d.get("description", "")
        result.items.append(item)

    print(f"\\nFound {len(result.items)} shops for '{request.search_query}':")
    for i, item in enumerate(result.items, 1):
        print(f"\\n  {i}. {item.name}")
        print(f"     Location: {item.location}  Rating: {item.rating}  Sales: {item.sales}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("etsy_shops")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            result = search_etsy_shops(page, EtsyShopsSearchRequest())
            print("\\n=== DONE ===")
            print(f"Found {len(result.items)} shops")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
