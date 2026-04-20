"""Playwright script (Python) — Realtor.com Home Search"""
import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint

@dataclass(frozen=True)
class RealtorRequest:
    location: str = "Austin, TX"
    min_price: int = 300000
    max_price: int = 500000
    max_results: int = 5

@dataclass
class ListingItem:
    address: str = ""
    price: str = ""
    bedrooms: str = ""
    bathrooms: str = ""
    sqft: str = ""
    status: str = ""

@dataclass
class RealtorResult:
    listings: List[ListingItem] = field(default_factory=list)

def search_realtor(page: Page, request: RealtorRequest) -> RealtorResult:
    url = f"https://www.realtor.com/realestateandhomes-search/Austin_TX/price-{request.min_price}-{request.max_price}"
    checkpoint("Navigate to Realtor.com search")
    page.goto(url, wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(8000)
    result = RealtorResult()
    js_code = """(max) => {
        const results = [];
        const cards = document.querySelectorAll('[data-testid="card-content"], [class*="CardContent"], article');
        for (const card of cards) {
            if (results.length >= max) break;
            const priceEl = card.querySelector('[data-testid="card-price"], [class*="price"]');
            const price = priceEl ? priceEl.textContent.trim() : '';
            const addrEl = card.querySelector('[data-testid="card-address"], [class*="address"]');
            const address = addrEl ? addrEl.textContent.trim() : '';
            if (!address) continue;
            const metaEls = card.querySelectorAll('[data-testid*="meta"], li');
            let beds = '', baths = '', sqft = '';
            for (const m of metaEls) {
                const t = m.textContent.trim().toLowerCase();
                if (t.includes('bed')) beds = t;
                if (t.includes('bath')) baths = t;
                if (t.includes('sqft') || t.includes('sq ft')) sqft = t;
            }
            results.push({ address, price, bedrooms: beds, bathrooms: baths, sqft, status: 'For Sale' });
        }
        return results;
    }"""
    for d in page.evaluate(js_code, request.max_results):
        item = ListingItem()
        item.address = d.get("address", "")
        item.price = d.get("price", "")
        item.bedrooms = d.get("bedrooms", "")
        item.bathrooms = d.get("bathrooms", "")
        item.sqft = d.get("sqft", "")
        item.status = d.get("status", "")
        result.listings.append(item)
    print(f"Found {len(result.listings)} listings")
    for i, l in enumerate(result.listings, 1):
        print(f"  {i}. {l.address} - {l.price}")
    return result

def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("realtor")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            search_realtor(page, RealtorRequest())
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)

if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
