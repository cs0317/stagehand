"""Playwright script (Python) — WeddingWire"""
import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint

@dataclass(frozen=True)
class WeddingWireRequest:
    location: str = "Chicago, Illinois"
    max_results: int = 5

@dataclass
class PhotographerItem:
    name: str = ""
    price_range: str = ""
    rating: str = ""
    reviews: str = ""
    location: str = ""

@dataclass
class WeddingWireResult:
    photographers: List[PhotographerItem] = field(default_factory=list)

def search_weddingwire(page: Page, request: WeddingWireRequest) -> WeddingWireResult:
    city = request.location.lower().replace(', ', '-').replace(' ', '-')
    url = f"https://www.weddingwire.com/shared/search?search_type=2&geo_id=us-tx-austin"
    checkpoint("Navigate to WeddingWire vendors")
    page.goto(url, wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(8000)
    result = WeddingWireResult()
    js_code = """(max) => {
        const results = [];
        const seen = new Set();
        const h2s = document.querySelectorAll('h2');
        for (const h2 of h2s) {
            if (results.length >= max) break;
            const name = h2.innerText.trim();
            if (!name || name.length < 3 || seen.has(name)) continue;
            if (name.match(/^(\\d+ results|Weddings|Filter|Sort|Privacy|Cookie|Sign|Menu|Search|Oh,)/i)) continue;
            seen.add(name);
            results.push({ name, priceRange: '', rating: '', reviews: '', location: '' });
        }
        return results;
    }"""
    for d in page.evaluate(js_code, request.max_results):
        item = PhotographerItem()
        item.name = d.get("name", "")
        item.price_range = d.get("priceRange", "")
        item.rating = d.get("rating", "")
        item.reviews = d.get("reviews", "")
        item.location = d.get("location", "")
        result.photographers.append(item)
    print(f"Found {len(result.photographers)} photographers")
    return result

def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("weddingwire")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            search_weddingwire(page, WeddingWireRequest())
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)

if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
