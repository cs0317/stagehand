"""Playwright script (Python) — West Elm"""
import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint

@dataclass(frozen=True)
class WestElmRequest:
    query: str = "mid-century modern sofas"
    max_results: int = 5

@dataclass
class ProductItem:
    name: str = ""
    price: str = ""
    dimensions: str = ""
    material: str = ""
    colors: str = ""
    rating: str = ""

@dataclass
class WestElmResult:
    products: List[ProductItem] = field(default_factory=list)

def search_westelm(page: Page, request: WestElmRequest) -> WestElmResult:
    url = f"https://www.westelm.com/search/results.html?words={request.query.replace(' ', '+')}"
    checkpoint("Navigate to West Elm search")
    page.goto(url, wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(8000)
    result = WestElmResult()
    js_code = """(max) => {
        const results = [];
        const seen = new Set();
        const links = document.querySelectorAll('a[href*="/products/"]');
        for (const a of links) {
            if (results.length >= max) break;
            const text = a.innerText.trim();
            if (!text || text.length < 5 || seen.has(text)) continue;
            if (text.match(/^(Request|Swatches|Item \\d|\\+)/i)) continue;
            seen.add(text);
            results.push({ name: text, price: '', dimensions: '', material: '', colors: '', rating: '' });
        }
        return results;
    }"""
    for d in page.evaluate(js_code, request.max_results):
        item = ProductItem()
        item.name = d.get("name", "")
        item.price = d.get("price", "")
        result.products.append(item)
    print(f"Found {len(result.products)} products")
    return result

def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("westelm")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            search_westelm(page, WestElmRequest())
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)

if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
