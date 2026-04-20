"""Playwright script (Python) — Zola"""
import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint

@dataclass(frozen=True)
class ZolaRequest:
    category: str = "Kitchen"
    max_results: int = 5

@dataclass
class GiftItem:
    name: str = ""
    brand: str = ""
    price: str = ""
    registrants: str = ""

@dataclass
class ZolaResult:
    items: List[GiftItem] = field(default_factory=list)

def browse_zola_registry(page: Page, request: ZolaRequest) -> ZolaResult:
    url = f"https://www.zola.com/shop/{request.category.lower()}"
    checkpoint("Navigate to Zola registry")
    page.goto(url, wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(8000)
    result = ZolaResult()
    js_code = """(max) => {
        const results = [];
        const cards = document.querySelectorAll('[class*="product"], [class*="card"], [class*="gift-item"]');
        for (const card of cards) {
            if (results.length >= max) break;
            const nameEl = card.querySelector('[class*="name"], [class*="title"], h3, h2');
            const name = nameEl ? nameEl.textContent.trim() : '';
            if (!name) continue;
            const brandEl = card.querySelector('[class*="brand"], [class*="designer"]');
            const brand = brandEl ? brandEl.textContent.trim() : '';
            const priceEl = card.querySelector('[class*="price"]');
            const price = priceEl ? priceEl.textContent.trim() : '';
            const regEl = card.querySelector('[class*="registrant"], [class*="added"]');
            const registrants = regEl ? regEl.textContent.trim() : '';
            results.push({ name, brand, price, registrants });
        }
        return results;
    }"""
    for d in page.evaluate(js_code, request.max_results):
        item = GiftItem()
        item.name = d.get("name", "")
        item.brand = d.get("brand", "")
        item.price = d.get("price", "")
        item.registrants = d.get("registrants", "")
        result.items.append(item)
    print(f"Found {len(result.items)} items")
    return result

def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("zola")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            browse_zola_registry(page, ZolaRequest())
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)

if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
