import os
import sys
import shutil
from dataclasses import dataclass, field
from typing import List

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class TipranksSearchRequest:
    ticker: str = "AAPL"


@dataclass
class TipranksStockItem:
    ticker: str = ""
    company_name: str = ""
    analyst_consensus: str = ""
    price_target: str = ""
    smart_score: str = ""
    num_analysts: str = ""
    sector: str = ""


@dataclass
class TipranksSearchResult:
    stock: TipranksStockItem = field(default_factory=TipranksStockItem)
    error: str = ""


def tipranks_search(page, request: TipranksSearchRequest) -> TipranksSearchResult:
    result = TipranksSearchResult()
    try:
        url = f"https://www.tipranks.com/stocks/{request.ticker}"
        page.goto(url, wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(5000)

        checkpoint(page, "Stock page loaded")

        stock_data = page.evaluate("""() => {
            const getText = (selectors) => {
                for (const sel of selectors) {
                    const el = document.querySelector(sel);
                    if (el && el.textContent.trim()) return el.textContent.trim();
                }
                return '';
            };

            return {
                ticker: getText(['[class*="ticker"], [data-testid="ticker"]']),
                company_name: getText(['h1', '[class*="companyName"], [class*="company-name"]']),
                analyst_consensus: getText(['[class*="consensus"], [class*="rating"]']),
                price_target: getText(['[class*="priceTarget"], [class*="price-target"]']),
                smart_score: getText(['[class*="smartScore"], [class*="smart-score"]']),
                num_analysts: getText(['[class*="numAnalysts"], [class*="analyst-count"]']),
                sector: getText(['[class*="sector"], [class*="industry"]']),
            };
        }""")

        result.stock = TipranksStockItem(**stock_data)

        checkpoint(page, f"Extracted data for {result.stock.ticker}")

    except Exception as e:
        result.error = str(e)
    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir()
    chrome_proc = launch_chrome(port, profile_dir)
    ws_url = wait_for_cdp_ws(port)

    from playwright.sync_api import sync_playwright
    pw = sync_playwright().start()
    browser = pw.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()

    try:
        request = TipranksSearchRequest()
        result = tipranks_search(page, request)
        s = result.stock
        print(f"Ticker: {s.ticker}")
        print(f"Company: {s.company_name}")
        print(f"Consensus: {s.analyst_consensus}")
        print(f"Price Target: {s.price_target}")
        print(f"Smart Score: {s.smart_score}")
        print(f"Analysts: {s.num_analysts}")
        print(f"Sector: {s.sector}")
        if result.error:
            print(f"Error: {result.error}")
    finally:
        browser.close()
        pw.stop()
        chrome_proc.terminate()
        shutil.rmtree(profile_dir, ignore_errors=True)


def run_with_debugger():
    test_func()


if __name__ == "__main__":
    run_with_debugger()
