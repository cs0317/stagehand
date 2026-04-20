"""Playwright script (Python) — Zillow Mortgage"""
import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint

@dataclass(frozen=True)
class ZillowMortgageRequest:
    loan_amount: int = 400000

@dataclass
class RateItem:
    loan_type: str = ""
    rate: str = ""
    apr: str = ""
    monthly_payment: str = ""

@dataclass
class ZillowMortgageResult:
    rates: List[RateItem] = field(default_factory=list)

def get_zillow_mortgage(page: Page, request: ZillowMortgageRequest) -> ZillowMortgageResult:
    url = "https://www.zillow.com/mortgage-rates/"
    checkpoint("Navigate to Zillow mortgage rates")
    page.goto(url, wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(8000)
    result = ZillowMortgageResult()
    js_code = """() => {
        const results = [];
        const rows = document.querySelectorAll('table tr, [class*="rate-row"], [class*="RateTable"]');
        for (const row of rows) {
            const cells = row.querySelectorAll('td, [class*="cell"]');
            if (cells.length < 2) continue;
            const typeEl = row.querySelector('th, td:first-child, [class*="type"]');
            const loanType = typeEl ? typeEl.textContent.trim() : '';
            if (!loanType) continue;
            const rateEl = cells[0] || row.querySelector('[class*="rate"]');
            const rate = rateEl ? rateEl.textContent.trim() : '';
            results.push({ loanType, rate, apr: '', monthlyPayment: '' });
        }
        return results;
    }"""
    for d in page.evaluate(js_code):
        item = RateItem()
        item.loan_type = d.get("loanType", "")
        item.rate = d.get("rate", "")
        result.rates.append(item)
    print(f"Found {len(result.rates)} rate types")
    return result

def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("zillow_mortgage")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            get_zillow_mortgage(page, ZillowMortgageRequest())
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)

if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
