"""Playwright script (Python) — Walmart Grocery"""
import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint

@dataclass(frozen=True)
class WalmartGroceryRequest:
    query: str = "organic snacks"
    max_results: int = 5

@dataclass
class ProductItem:
    name: str = ""
    price: str = ""
    price_per_unit: str = ""
    rating: str = ""
    availability: str = ""

@dataclass
class WalmartGroceryResult:
    products: List[ProductItem] = field(default_factory=list)

def search_walmart_grocery(page: Page, request: WalmartGroceryRequest) -> WalmartGroceryResult:
    url = f"https://www.walmart.com/browse/food/976759"
    checkpoint("Navigate to Walmart grocery")
    page.goto(url, wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(8000)
    result = WalmartGroceryResult()
    js_code = """(max) => {
        const results = [];
        const seen = new Set();
        const h3s = document.querySelectorAll('h3');
        for (const h3 of h3s) {
            if (results.length >= max) break;
            const name = h3.innerText.trim();
            if (!name || name.length < 10 || seen.has(name)) continue;
            if (name.match(/^(Shop|Browse|Filter|Sort|Privacy|Cookie|Sign|Menu|Featured)/i)) continue;
            seen.add(name);
            const priceMatch = name.match(/(\\$[\\d,.]+)/);
            const price = priceMatch ? priceMatch[1] : '';
            const cleanName = name.replace(/\\$[\\d,.]+.*$/, '').trim();
            results.push({ name: cleanName, price, pricePerUnit: '', rating: '', availability: '' });
        }
        return results;
    }"""
    for d in page.evaluate(js_code, request.max_results):
        item = ProductItem()
        item.name = d.get("name", "")
        item.price = d.get("price", "")
        item.price_per_unit = d.get("pricePerUnit", "")
        item.rating = d.get("rating", "")
        result.products.append(item)
    print(f"Found {len(result.products)} products")
    return result

def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("walmart_grocery")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            search_walmart_grocery(page, WalmartGroceryRequest())
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)

if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
