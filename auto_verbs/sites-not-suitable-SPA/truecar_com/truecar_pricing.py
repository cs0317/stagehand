"""Playwright script (Python) — TrueCar"""
import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint

@dataclass(frozen=True)
class TrueCarRequest:
    make: str = "Ford"
    model: str = "F-150"
    max_results: int = 5

@dataclass
class TrimItem:
    trim: str = ""
    msrp: str = ""
    avg_price: str = ""
    savings: str = ""
    inventory: str = ""

@dataclass
class TrueCarResult:
    trims: List[TrimItem] = field(default_factory=list)

def get_truecar_pricing(page: Page, request: TrueCarRequest) -> TrueCarResult:
    url = f"https://www.truecar.com/prices-new/{request.make.lower()}/{request.model.lower()}-pricing/"
    checkpoint("Navigate to TrueCar pricing")
    page.goto(url, wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(8000)
    result = TrueCarResult()
    js_code = """(max) => {
        const results = [];
        const cards = document.querySelectorAll('[class*="trim"], [data-test*="trim"], [class*="vehicle-card"]');
        for (const card of cards) {
            if (results.length >= max) break;
            const nameEl = card.querySelector('h3, h2, [class*="name"]');
            const trim = nameEl ? nameEl.textContent.trim() : '';
            if (!trim) continue;
            const priceEl = card.querySelector('[class*="price"], [class*="msrp"]');
            const msrp = priceEl ? priceEl.textContent.trim() : '';
            results.push({ trim, msrp, avg_price: '', savings: '', inventory: '' });
        }
        return results;
    }"""
    for d in page.evaluate(js_code, request.max_results):
        item = TrimItem()
        item.trim = d.get("trim", "")
        item.msrp = d.get("msrp", "")
        result.trims.append(item)
    print(f"Found {len(result.trims)} trims")
    return result

def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("truecar")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            get_truecar_pricing(page, TrueCarRequest())
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)

if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
