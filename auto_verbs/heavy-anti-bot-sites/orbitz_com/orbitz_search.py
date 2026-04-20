"""
Playwright script (Python) — Orbitz Vacation Packages
Search Orbitz for Cancun vacation packages.
"""

import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class OrbitzRequest:
    destination: str = "Cancun, Mexico"
    max_results: int = 5


@dataclass
class PackageItem:
    hotel_name: str = ""
    flight_included: str = ""
    total_price: str = ""
    duration: str = ""
    rating: str = ""


@dataclass
class OrbitzResult:
    packages: List[PackageItem] = field(default_factory=list)


# Searches Orbitz for vacation packages and extracts hotel name,
# flight included, total price, duration, and rating.
def search_orbitz(page: Page, request: OrbitzRequest) -> OrbitzResult:
    url = "https://www.orbitz.com/Cancun-Hotels.d602678.Travel-Guide-Hotels"
    print(f"Loading {url}...")
    checkpoint("Navigate to Orbitz")
    page.goto(url, wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(8000)

    result = OrbitzResult()

    checkpoint("Extract hotel/package listings")
    js_code = """(max) => {
        const results = [];
        const cards = document.querySelectorAll('[data-testid*="listing"], [class*="hotel"], article, [class*="card"]');
        for (const card of cards) {
            if (results.length >= max) break;
            const nameEl = card.querySelector('h3, h2, [class*="name"], [class*="title"]');
            const name = nameEl ? nameEl.textContent.trim() : '';
            if (!name || name.length < 3) continue;

            const priceEl = card.querySelector('[class*="price"], [data-testid*="price"]');
            const price = priceEl ? priceEl.textContent.trim() : '';

            const ratingEl = card.querySelector('[class*="rating"], [aria-label*="rating"]');
            const rating = ratingEl ? (ratingEl.getAttribute('aria-label') || ratingEl.textContent.trim()) : '';

            results.push({ hotel_name: name, flight_included: 'No', total_price: price, duration: '', rating });
        }
        return results;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = PackageItem()
        item.hotel_name = d.get("hotel_name", "")
        item.flight_included = d.get("flight_included", "")
        item.total_price = d.get("total_price", "")
        item.duration = d.get("duration", "")
        item.rating = d.get("rating", "")
        result.packages.append(item)

    print(f"\nFound {len(result.packages)} packages:")
    for i, p in enumerate(result.packages, 1):
        print(f"\n  {i}. {p.hotel_name}")
        print(f"     Price: {p.total_price}  Rating: {p.rating}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("orbitz")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            result = search_orbitz(page, OrbitzRequest())
            print("\n=== DONE ===")
            print(f"Found {len(result.packages)} packages")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
