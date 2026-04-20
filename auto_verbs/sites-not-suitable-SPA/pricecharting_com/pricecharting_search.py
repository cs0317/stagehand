"""
Playwright script (Python) — PriceCharting Game Prices
Search PriceCharting for retro game prices.
"""

import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class PriceChartingRequest:
    query: str = "Super Mario Bros"
    max_results: int = 5


@dataclass
class GameListing:
    title: str = ""
    platform: str = ""
    loose_price: str = ""
    complete_price: str = ""
    new_price: str = ""
    trend: str = ""


@dataclass
class PriceChartingResult:
    listings: List[GameListing] = field(default_factory=list)


# Searches PriceCharting for game prices and extracts title,
# platform, loose price, complete price, new price, and trend.
def search_pricecharting(page: Page, request: PriceChartingRequest) -> PriceChartingResult:
    url = f"https://www.pricecharting.com/search-products?q={request.query.replace(' ', '+')}&type=prices"
    print(f"Loading {url}...")
    checkpoint("Navigate to PriceCharting search")
    page.goto(url, wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(5000)

    result = PriceChartingResult()

    checkpoint("Extract game listings")
    js_code = """(max) => {
        const results = [];
        const rows = document.querySelectorAll('table#games_table tbody tr, table tbody tr');
        for (const row of rows) {
            if (results.length >= max) break;
            const cells = row.querySelectorAll('td');
            if (cells.length < 3) continue;
            const titleEl = cells[0] ? cells[0].querySelector('a') : null;
            const title = titleEl ? titleEl.textContent.trim() : (cells[0] ? cells[0].textContent.trim() : '');
            if (!title || title.length < 2) continue;

            const platform = cells[1] ? cells[1].textContent.trim() : '';
            const loose = cells[2] ? cells[2].textContent.trim() : '';
            const complete = cells[3] ? cells[3].textContent.trim() : '';
            const newp = cells[4] ? cells[4].textContent.trim() : '';

            results.push({ title, platform, loose_price: loose, complete_price: complete, new_price: newp, trend: '' });
        }
        return results;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = GameListing()
        item.title = d.get("title", "")
        item.platform = d.get("platform", "")
        item.loose_price = d.get("loose_price", "")
        item.complete_price = d.get("complete_price", "")
        item.new_price = d.get("new_price", "")
        item.trend = d.get("trend", "")
        result.listings.append(item)

    print(f"\nFound {len(result.listings)} listings:")
    for i, g in enumerate(result.listings, 1):
        print(f"\n  {i}. {g.title} ({g.platform})")
        print(f"     Loose: {g.loose_price}  Complete: {g.complete_price}  New: {g.new_price}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("pricecharting")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            result = search_pricecharting(page, PriceChartingRequest())
            print("\n=== DONE ===")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
