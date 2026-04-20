"""Playwright script (Python) — Rent the Runway"""
import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint

@dataclass(frozen=True)
class RTRRequest:
    event: str = "black tie"
    max_results: int = 5

@dataclass
class DressItem:
    designer: str = ""
    name: str = ""
    rental_price: str = ""
    retail_price: str = ""
    sizes: str = ""
    rating: str = ""

@dataclass
class RTRResult:
    dresses: List[DressItem] = field(default_factory=list)

def search_rtr(page: Page, request: RTRRequest) -> RTRResult:
    url = "https://www.renttherunway.com/shop/dress?occasion=black_tie"
    checkpoint("Navigate to Rent the Runway")
    page.goto(url, wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(8000)
    result = RTRResult()
    js_code = """(max) => {
        const results = [];
        const cards = document.querySelectorAll('[class*="product"], [class*="card"], article');
        for (const card of cards) {
            if (results.length >= max) break;
            const designerEl = card.querySelector('[class*="designer"], [class*="brand"]');
            const designer = designerEl ? designerEl.textContent.trim() : '';
            const nameEl = card.querySelector('[class*="name"], h3, h2');
            const name = nameEl ? nameEl.textContent.trim() : '';
            if (!name && !designer) continue;
            const priceEl = card.querySelector('[class*="price"]');
            const rental_price = priceEl ? priceEl.textContent.trim() : '';
            results.push({ designer, name, rental_price, retail_price: '', sizes: '', rating: '' });
        }
        return results;
    }"""
    for d in page.evaluate(js_code, request.max_results):
        item = DressItem()
        item.designer = d.get("designer", "")
        item.name = d.get("name", "")
        item.rental_price = d.get("rental_price", "")
        result.dresses.append(item)
    print(f"Found {len(result.dresses)} dresses")
    return result

def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("rtr")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            search_rtr(page, RTRRequest())
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)

if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
