"""Playwright script (Python) — Tractor Supply"""
import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint

@dataclass(frozen=True)
class TractorSupplyRequest:
    query: str = "chicken coops"
    max_results: int = 5

@dataclass
class ProductItem:
    name: str = ""
    brand: str = ""
    price: str = ""
    rating: str = ""
    reviews: str = ""

@dataclass
class TractorSupplyResult:
    products: List[ProductItem] = field(default_factory=list)

def search_tractorsupply(page: Page, request: TractorSupplyRequest) -> TractorSupplyResult:
    url = f"https://www.tractorsupply.com/tsc/search/{request.query.replace(' ', '+')}"
    checkpoint("Navigate to Tractor Supply search")
    page.goto(url, wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(8000)
    result = TractorSupplyResult()
    js_code = """(max) => {
        const results = [];
        const cards = document.querySelectorAll('[class*="product-card"], [data-test*="product"], [class*="plp-product"]');
        for (const card of cards) {
            if (results.length >= max) break;
            const nameEl = card.querySelector('[class*="title"], h3, h2, a[class*="product-name"]');
            const name = nameEl ? nameEl.textContent.trim() : '';
            if (!name) continue;
            const brandEl = card.querySelector('[class*="brand"]');
            const brand = brandEl ? brandEl.textContent.trim() : '';
            const priceEl = card.querySelector('[class*="price"]');
            const price = priceEl ? priceEl.textContent.trim() : '';
            const ratingEl = card.querySelector('[class*="rating"]');
            const rating = ratingEl ? ratingEl.textContent.trim() : '';
            results.push({ name, brand, price, rating, reviews: '' });
        }
        return results;
    }"""
    for d in page.evaluate(js_code, request.max_results):
        item = ProductItem()
        item.name = d.get("name", "")
        item.brand = d.get("brand", "")
        item.price = d.get("price", "")
        item.rating = d.get("rating", "")
        result.products.append(item)
    print(f"Found {len(result.products)} products")
    return result

def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("tractorsupply")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            search_tractorsupply(page, TractorSupplyRequest())
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)

if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
