"""
Auto-generated Playwright script (Python)
KBB - Car Value Lookup
Vehicle: 2020 toyota camry SE

Generated on: 2026-04-15T21:22:47.887Z
Recorded 1 browser interactions
"""

import re
import os, sys, shutil
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws


PRICE_RE = re.compile(r'^\$[\d,]+$')
CONDITIONS = ['Excellent', 'Very Good', 'Good', 'Fair']


def run(
    playwright: Playwright,
    make: str = "toyota",
    model: str = "camry",
    year: str = "2020",
    trim: str = "se",
    body_style: str = "sedan-4d",
) -> dict:
    print(f"  Vehicle: {year} {make.title()} {model.title()} {trim.upper()}")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("kbb_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    result = {}

    try:
        url = f"https://www.kbb.com/{make}/{model}/{year}/{trim}-{body_style}/"
        print(f"Loading {url}...")
        page.goto(url)
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(10000)
        print(f"  Loaded: {page.url}")

        text = page.evaluate("document.body ? document.body.innerText : ''") or ""
        text_lines = [l.strip() for l in text.split("\n") if l.strip()]

        # Find 'Values and Prices' section
        fair_price = None
        trade_in = {}
        private_party = {}

        i = 0
        while i < len(text_lines):
            line = text_lines[i]

            if line == "Fair Purchase Price" and i + 1 < len(text_lines):
                nxt = text_lines[i + 1]
                if PRICE_RE.match(nxt) and not fair_price:
                    fair_price = nxt
                    i += 2
                    continue

            if line in CONDITIONS:
                cond = line
                if i + 2 < len(text_lines):
                    ti = text_lines[i + 1]
                    pp = text_lines[i + 2]
                    if PRICE_RE.match(ti) and PRICE_RE.match(pp):
                        trade_in[cond] = ti
                        private_party[cond] = pp
                        i += 3
                        continue

            i += 1

        title = f"{year} {make.title()} {model.title()} {trim.upper()}"
        print("=" * 60)
        print(f"KBB Values for {title}")
        print("=" * 60)
        print(f"\nFair Purchase Price: {fair_price or 'N/A'}")
        print(f"\nTrade-In Values:")
        for cond in CONDITIONS:
            print(f"  {cond:>10}: {trade_in.get(cond, 'N/A')}")
        print(f"\nPrivate Party Values:")
        for cond in CONDITIONS:
            print(f"  {cond:>10}: {private_party.get(cond, 'N/A')}")

        result = {
            "vehicle": title,
            "fair_purchase_price": fair_price,
            "trade_in": trade_in,
            "private_party": private_party,
        }

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