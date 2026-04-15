"""
Auto-generated Playwright script (Python)
Sam's Club - Product Search
Query: protein bars

Generated on: 2026-04-15T22:16:46.585Z
Recorded 1 browser interactions
"""

import re
import os, sys, shutil
from urllib.parse import quote
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws


CURRENT_PRICE_RE = re.compile(r'^current price \$(\S+)')
UNIT_PRICE_RE = re.compile(r'^\$[\d.]+/\w+')
RATING_RE = re.compile(r'^([\d.]+) out of 5 Stars\. (\d+) reviews?')


def run(
    playwright: Playwright,
    query: str = "protein bars",
    max_results: int = 5,
) -> list:
    print(f"  Query: {query}\n")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("samsclub_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        url = f"https://www.samsclub.com/s/{quote(query)}"
        print(f"Loading {url}...")
        page.goto(url, wait_until="domcontentloaded")
        page.wait_for_timeout(10000)
        print(f"  Loaded: {page.url}")

        text = page.evaluate("document.body ? document.body.innerText : ''") or ""
        text_lines = [l.strip() for l in text.split("\n") if l.strip()]

        # Skip to search results (after 'Relevance' sort option)
        i = 0
        while i < len(text_lines):
            if text_lines[i] == 'Relevance':
                i += 1
                break
            i += 1

        # Skip 'Related searches' section
        if i < len(text_lines) and text_lines[i] == 'Related searches':
            while i < len(text_lines) and text_lines[i] != 'Add to Cart':
                i += 1

        seen = set()
        while i < len(text_lines) and len(results) < max_results:
            line = text_lines[i]

            if line == 'Add to Cart' and i > 0:
                name = text_lines[i - 1]
                if name in seen:
                    i += 1
                    continue
                seen.add(name)

                # Scan forward for price, unit price, rating
                price = 'N/A'
                unit_price = 'N/A'
                rating = 'N/A'

                for j in range(i + 1, min(i + 10, len(text_lines))):
                    cm = CURRENT_PRICE_RE.match(text_lines[j])
                    if cm:
                        price = '$' + cm.group(1)
                    if UNIT_PRICE_RE.match(text_lines[j]):
                        unit_price = text_lines[j]
                    rm = RATING_RE.match(text_lines[j])
                    if rm:
                        rating = f"{rm.group(1)}/5 ({rm.group(2)} reviews)"
                        break

                results.append({
                    'name': name,
                    'price': price,
                    'unit_price': unit_price,
                    'rating': rating,
                })

            i += 1

        print("=" * 60)
        print(f"Sam\'s Club: {query}")
        print("=" * 60)
        for idx, r in enumerate(results, 1):
            print(f"\n{idx}. {r['name']}")
            print(f"   Price:      {r['price']}")
            print(f"   Unit Price: {r['unit_price']}")
            print(f"   Rating:     {r['rating']}")

        print(f"\nFound {len(results)} products")

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        browser.close()
        chrome_proc.terminate()
        shutil.rmtree(profile_dir, ignore_errors=True)

    return results


if __name__ == "__main__":
    with sync_playwright() as pw:
        run(pw)