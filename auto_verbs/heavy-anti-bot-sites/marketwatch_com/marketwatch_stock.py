"""MarketWatch – Stock Lookup. Uses Playwright via CDP."""
import re, os, sys, shutil
from playwright.sync_api import Playwright, sync_playwright
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws

def run(playwright: Playwright, ticker: str = "AAPL") -> dict:
    print(f"  Ticker: {ticker}\n")
    port = get_free_port(); profile_dir = get_temp_profile_dir("marketwatch_com")
    chrome_proc = launch_chrome(profile_dir, port); ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]; page = context.pages[0] if context.pages else context.new_page()
    result = {}
    try:
        page.goto(f"https://www.marketwatch.com/investing/stock/{ticker.upper()}")
        page.wait_for_load_state("domcontentloaded"); page.wait_for_timeout(3000)
        for sel in ["button#onetrust-accept-btn-handler", "button:has-text('Accept')", "button:has-text('Got it')", "button:has-text('Close')"]:
            try:
                btn = page.locator(sel).first
                if btn.is_visible(timeout=1500): btn.evaluate("el => el.click()"); page.wait_for_timeout(500)
            except Exception: pass

        # Extract current price
        try:
            price_el = page.locator('bg-quote[class*="value"], h2[class*="intraday"] bg-quote, [class*="intraday__price"] bg-quote').first
            result["price"] = price_el.inner_text(timeout=3000).strip()
        except Exception:
            try: result["price"] = page.locator('td:has-text("$"), span[class*="price"]').first.inner_text(timeout=3000).strip()
            except Exception: result["price"] = "N/A"

        # Extract price change
        try:
            change_el = page.locator('[class*="change--point"], span[class*="change"]').first
            result["change"] = change_el.inner_text(timeout=3000).strip()
        except Exception: result["change"] = "N/A"

        # Extract key data (market cap, P/E)
        try:
            key_data = page.locator('[class*="key-data"], [class*="profile"], ul[class*="list--kv"]')
            text = key_data.first.inner_text(timeout=3000)
            mc = re.search(r"Market Cap.*?([\d\.]+[BMT]?)", text)
            pe = re.search(r"P/E Ratio.*?([\d\.]+)", text)
            result["market_cap"] = mc.group(1) if mc else "N/A"
            result["pe_ratio"] = pe.group(1) if pe else "N/A"
        except Exception:
            result["market_cap"] = "N/A"; result["pe_ratio"] = "N/A"

        print(f"Stock: {ticker}")
        print(f"  Price:      {result.get('price', 'N/A')}")
        print(f"  Change:     {result.get('change', 'N/A')}")
        print(f"  Market Cap: {result.get('market_cap', 'N/A')}")
        print(f"  P/E Ratio:  {result.get('pe_ratio', 'N/A')}")

    except Exception as e: import traceback; print(f"Error: {e}"); traceback.print_exc()
    finally:
        try: browser.close()
        except Exception: pass
        chrome_proc.terminate(); shutil.rmtree(profile_dir, ignore_errors=True)
    return result

if __name__ == "__main__":
    with sync_playwright() as playwright: run(playwright)
