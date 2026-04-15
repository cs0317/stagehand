"""
Auto-generated Playwright script (Python)
CoinMarketCap – Crypto Price Lookup
Query: Bitcoin

Generated on: 2026-04-15T20:39:31.924Z
"""

import re
import os, sys, shutil
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws


def run(
    playwright: Playwright,
    query: str = "Bitcoin",
) -> dict:
    print(f"  Query: {query}\n")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("coinmarketcap_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    result = {}

    try:
        # ── Navigate ──────────────────────────────────────────────────
        print("Loading CoinMarketCap...")
        slug = query.lower().replace(" ", "-")
        page.goto(f"https://coinmarketcap.com/currencies/{slug}/")
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(5000)
        print(f"  Loaded: {page.url}")

        # ── Extract crypto data ───────────────────────────────────────
        print("Extracting crypto data...")

        body_text = page.evaluate("document.body.innerText") or ""
        lines = [l.strip() for l in body_text.split("\n") if l.strip()]

        price = "N/A"
        change_24h = "N/A"
        market_cap = "N/A"
        volume_24h = "N/A"

        for i, line in enumerate(lines):
            # Price: "$XX,XXX.XX" pattern (large number with decimals)
            if price == "N/A" and re.match(r"^\$[\d,]+\.\d{2}$", line):
                price = line

            # 24h change: "X.XX% (24h)" pattern
            if "(24h)" in line and "%" in line:
                m = re.search(r"([\-\d.]+)%\s*\(24h\)", line)
                if m:
                    change_24h = m.group(1) + "%"

            # Market cap
            if line == "Market cap" and i + 1 < len(lines):
                market_cap = lines[i + 1]

            # Volume (24h) — look for "$" value within next few lines
            if "Volume (24h)" in line:
                for j in range(i + 1, min(i + 4, len(lines))):
                    if lines[j].startswith("$"):
                        volume_24h = lines[j]
                        break

        result = {
            "name": query,
            "price": price,
            "change_24h": change_24h,
            "market_cap": market_cap,
            "volume_24h": volume_24h,
        }

        # ── Print results ─────────────────────────────────────────────
        print(f"\n{result['name']}:")
        print(f"  Current Price:    {result['price']}")
        print(f"  24h Change:       {result['change_24h']}")
        print(f"  Market Cap:       {result['market_cap']}")
        print(f"  24h Volume:       {result['volume_24h']}")

    except Exception as e:
        import traceback
        print(f"Error: {e}")
        traceback.print_exc()
    finally:
        try:
            browser.close()
        except Exception:
            pass
        chrome_proc.terminate()
        shutil.rmtree(profile_dir, ignore_errors=True)

    return result


if __name__ == "__main__":
    with sync_playwright() as playwright:
        run(playwright)
