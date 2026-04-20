"""Playwright script (Python) — Rent.com Apartment Search"""
import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint

@dataclass(frozen=True)
class RentRequest:
    location: str = "Denver, CO"
    bedrooms: int = 2
    max_results: int = 5

@dataclass
class ApartmentItem:
    name: str = ""
    rent_range: str = ""
    bedrooms: str = ""
    bathrooms: str = ""
    sqft: str = ""
    amenities: str = ""

@dataclass
class RentResult:
    listings: List[ApartmentItem] = field(default_factory=list)

def search_rent(page: Page, request: RentRequest) -> RentResult:
    url = "https://www.rent.com/colorado/denver-apartments/2-bedrooms"
    checkpoint("Navigate to Rent.com")
    page.goto(url, wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(8000)
    result = RentResult()
    js_code = """(max) => {
        const results = [];
        const cards = document.querySelectorAll('[data-tag_section="card"], [class*="ListingCard"], article');
        for (const card of cards) {
            if (results.length >= max) break;
            const nameEl = card.querySelector('h3, [class*="title"], [data-tag_item="property_name"]');
            const name = nameEl ? nameEl.textContent.trim() : '';
            if (!name) continue;
            const priceEl = card.querySelector('[class*="price"], [data-tag_item="price"]');
            const rent = priceEl ? priceEl.textContent.trim() : '';
            results.push({ name, rent_range: rent, bedrooms: '2', bathrooms: '', sqft: '', amenities: '' });
        }
        return results;
    }"""
    for d in page.evaluate(js_code, request.max_results):
        item = ApartmentItem()
        item.name = d.get("name", "")
        item.rent_range = d.get("rent_range", "")
        item.bedrooms = d.get("bedrooms", "")
        result.listings.append(item)
    print(f"Found {len(result.listings)} listings")
    return result

def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("rent")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            search_rent(page, RentRequest())
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)

if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
