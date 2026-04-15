"""
Auto-generated Playwright script (Python)
Yahoo Finance - Stock Quote Extraction
Symbol: AAPL

Generated on: 2026-04-15T21:12:27.809Z
Recorded 2 browser interactions
"""

import re
import os, sys, shutil
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws


def run(
    playwright: Playwright,
    symbol: str = "AAPL",
) -> dict:
    print(f"  Symbol: {symbol}\n")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("finance_yahoo_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    result = {}

    try:
        url = f"https://finance.yahoo.com/quote/{symbol}/"
        print(f"Loading {url}...")
        page.goto(url)
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(8000)
        print(f"  Loaded: {page.url}")

        text = page.evaluate("document.body ? document.body.innerText : ''") or ""
        lines = [l.strip() for l in text.split("\n") if l.strip()]

        # Find the stock name line containing the symbol in parentheses
        stock_name = symbol
        price = "N/A"
        change_amount = "N/A"
        change_pct = "N/A"
        volume = "N/A"
        market_cap = "N/A"

        for i, line in enumerate(lines):
            # Find stock name and price
            if f"({symbol})" in line and len(line) < 60:
                stock_name = line
                # Next line is the current price
                if i + 1 < len(lines):
                    price_candidate = lines[i + 1]
                    if re.match(r"^[\d,.]+$", price_candidate):
                        price = price_candidate
                # Day change amount (starts with + or -)
                if i + 2 < len(lines):
                    chg = lines[i + 2]
                    if re.match(r"^[+-]", chg):
                        change_amount = chg
                # Day change percentage
                if i + 3 < len(lines):
                    pct = lines[i + 3]
                    if pct.startswith("(") and "%" in pct:
                        change_pct = pct

            # Find volume
            if line == "Volume" and i + 1 < len(lines):
                volume = lines[i + 1]

            # Find market cap
            if "Market Cap" in line and i + 1 < len(lines):
                market_cap = lines[i + 1]

        result = {
            "name": stock_name,
            "price": price,
            "change": change_amount + " " + change_pct,
            "volume": volume,
            "market_cap": market_cap,
        }

        print("=" * 50)
        print(f"Stock Quote: {stock_name}")
        print("=" * 50)
        print(f"  Current Price: ${price}")
        print(f"  Day Change:    {change_amount} {change_pct}")
        print(f"  Volume:        {volume}")
        print(f"  Market Cap:    {market_cap}")

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        browser.close()
        chrome_proc.terminate()
        shutil.rmtree(profile_dir, ignore_errors=True)

    return result


if __name__ == "__main__":
    with sync_playwright() as pw:
        run(pw)