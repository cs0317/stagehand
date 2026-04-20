"""Playwright script (Python) — Whole Foods Deals"""
import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint

@dataclass(frozen=True)
class WholeFoodsDealsRequest:
    max_results: int = 5

@dataclass
class DealItem:
    name: str = ""
    sale_price: str = ""
    regular_price: str = ""
    savings: str = ""

@dataclass
class WholeFoodsDealsResult:
    deals: List[DealItem] = field(default_factory=list)

def get_wholefoods_deals(page: Page, request: WholeFoodsDealsRequest) -> WholeFoodsDealsResult:
    url = "https://www.wholefoodsmarket.com/sales-flyer"
    checkpoint("Navigate to Whole Foods deals")
    page.goto(url, wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(8000)
    result = WholeFoodsDealsResult()
    js_code = """(max) => {
        const results = [];
        const cards = document.querySelectorAll('[class*="deal"], [class*="product"], [class*="sale"], [class*="card"]');
        for (const card of cards) {
            if (results.length >= max) break;
            const nameEl = card.querySelector('[class*="name"], [class*="title"], h3, h2');
            const name = nameEl ? nameEl.textContent.trim() : '';
            if (!name) continue;
            const priceEl = card.querySelector('[class*="price"], [class*="sale"]');
            const salePrice = priceEl ? priceEl.textContent.trim() : '';
            const regEl = card.querySelector('[class*="regular"], [class*="was"]');
            const regularPrice = regEl ? regEl.textContent.trim() : '';
            const saveEl = card.querySelector('[class*="saving"], [class*="discount"]');
            const savings = saveEl ? saveEl.textContent.trim() : '';
            results.push({ name, salePrice, regularPrice, savings });
        }
        return results;
    }"""
    for d in page.evaluate(js_code, request.max_results):
        item = DealItem()
        item.name = d.get("name", "")
        item.sale_price = d.get("salePrice", "")
        item.regular_price = d.get("regularPrice", "")
        item.savings = d.get("savings", "")
        result.deals.append(item)
    print(f"Found {len(result.deals)} deals")
    return result

def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("wholefoods_deals")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            get_wholefoods_deals(page, WholeFoodsDealsRequest())
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)

if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
