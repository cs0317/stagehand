"""Playwright script (Python) — Ulta"""
import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint

@dataclass(frozen=True)
class UltaRequest:
    query: str = "foundation"
    max_results: int = 5

@dataclass
class ProductItem:
    name: str = ""
    brand: str = ""
    price: str = ""
    rating: str = ""
    reviews: str = ""
    shades: str = ""

@dataclass
class UltaResult:
    products: List[ProductItem] = field(default_factory=list)

def search_ulta(page: Page, request: UltaRequest) -> UltaResult:
    url = f"https://www.ulta.com/shop/search?query={request.query.replace(' ', '+')}"
    checkpoint("Navigate to Ulta search")
    page.goto(url, wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(8000)
    result = UltaResult()
    js_code = """(max) => {
        const results = [];
        const cards = document.querySelectorAll('[class*="ProductCard"], [class*="product-card"], [data-testid*="product"]');
        for (const card of cards) {
            if (results.length >= max) break;
            const brandEl = card.querySelector('[class*="brand"]');
            const brand = brandEl ? brandEl.textContent.trim() : '';
            const nameEl = card.querySelector('[class*="name"], [class*="title"], h3');
            const name = nameEl ? nameEl.textContent.trim() : '';
            if (!name && !brand) continue;
            const priceEl = card.querySelector('[class*="price"]');
            const price = priceEl ? priceEl.textContent.trim() : '';
            const ratingEl = card.querySelector('[class*="rating"]');
            const rating = ratingEl ? ratingEl.textContent.trim() : '';
            results.push({ name, brand, price, rating, reviews: '', shades: '' });
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
    profile_dir = get_temp_profile_dir("ulta")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            search_ulta(page, UltaRequest())
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)

if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
