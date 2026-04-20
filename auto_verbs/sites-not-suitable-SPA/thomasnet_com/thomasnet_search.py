"""Playwright script (Python) — ThomasNet"""
import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint

@dataclass(frozen=True)
class ThomasNetRequest:
    query: str = "CNC machining services"
    max_results: int = 5

@dataclass
class SupplierItem:
    company: str = ""
    location: str = ""
    revenue: str = ""
    employees: str = ""
    certifications: str = ""

@dataclass
class ThomasNetResult:
    suppliers: List[SupplierItem] = field(default_factory=list)

def search_thomasnet(page: Page, request: ThomasNetRequest) -> ThomasNetResult:
    url = f"https://www.thomasnet.com/nsearch.html?what={request.query.replace(' ', '+')}"
    checkpoint("Navigate to ThomasNet search")
    page.goto(url, wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(5000)
    result = ThomasNetResult()
    js_code = """(max) => {
        const results = [];
        const cards = document.querySelectorAll('[class*="supplier"], [class*="company-card"], .supplier-result');
        for (const card of cards) {
            if (results.length >= max) break;
            const nameEl = card.querySelector('h2, h3, [class*="company-name"] a');
            const company = nameEl ? nameEl.textContent.trim() : '';
            if (!company) continue;
            const locEl = card.querySelector('[class*="location"], [class*="city"]');
            const location = locEl ? locEl.textContent.trim() : '';
            results.push({ company, location, revenue: '', employees: '', certifications: '' });
        }
        return results;
    }"""
    for d in page.evaluate(js_code, request.max_results):
        item = SupplierItem()
        item.company = d.get("company", "")
        item.location = d.get("location", "")
        result.suppliers.append(item)
    print(f"Found {len(result.suppliers)} suppliers")
    return result

def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("thomasnet")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            search_thomasnet(page, ThomasNetRequest())
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)

if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
