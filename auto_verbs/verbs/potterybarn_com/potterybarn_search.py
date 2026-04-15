"""
Auto-generated Playwright script (Python)
Pottery Barn - Product Search
Query: sofa

Generated on: 2026-04-15T21:55:16.243Z
Recorded 1 browser interactions
"""

import re
import os, sys, shutil
from urllib.parse import quote_plus
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws


PRICE_RE = re.compile(r'^\$\s+[\d,]+')
COLORS_RE = re.compile(r'^\+\s+(\d+)\s+more$')


def run(
    playwright: Playwright,
    query: str = "sofa",
    max_results: int = 5,
) -> list:
    print(f"  Query: {query}\n")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("potterybarn_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        url = f"https://www.potterybarn.com/search/results.html?words={quote_plus(query)}"
        print(f"Loading {url}...")
        page.goto(url, wait_until="domcontentloaded")
        page.wait_for_timeout(10000)
        print(f"  Loaded: {page.url}")

        text = page.evaluate("document.body ? document.body.innerText : ''") or ""
        text_lines = [l.strip() for l in text.split("\n") if l.strip()]

        # Skip to search results
        i = 0
        while i < len(text_lines):
            if text_lines[i] == 'Best Match':
                i += 1
                break
            i += 1

        while i < len(text_lines) and len(results) < max_results:
            line = text_lines[i]

            if line == 'Contract Grade':
                # Product name is the next line
                name = text_lines[i + 1] if i + 1 < len(text_lines) else 'Unknown'

                # Find price (look ahead up to 6 lines)
                price = 'N/A'
                for j in range(i + 2, min(i + 8, len(text_lines))):
                    if PRICE_RE.match(text_lines[j]):
                        price = text_lines[j]
                        break

                # Find colors (look back for '+ N more')
                colors = 'N/A'
                for j in range(i - 1, max(i - 6, 0), -1):
                    cm = COLORS_RE.match(text_lines[j])
                    if cm:
                        colors = cm.group(1) + '+ colors'
                        break

                results.append({
                    'name': name,
                    'price': price,
                    'colors': colors,
                })

            i += 1

        print("=" * 60)
        print(f"Pottery Barn: {query}")
        print("=" * 60)
        for idx, r in enumerate(results, 1):
            print(f"\n{idx}. {r['name']}")
            print(f"   Price:  {r['price']}")
            print(f"   Colors: {r['colors']}")

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