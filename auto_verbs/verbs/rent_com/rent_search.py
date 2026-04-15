"""
Auto-generated Playwright script (Python)
Rent.com - Apartment Search
Location: Chicago, IL, Bedrooms: 2+

Generated on: 2026-04-15T22:10:06.186Z
Recorded 1 browser interactions
"""

import re
import os, sys, shutil
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws


PRICE_RE = re.compile(r'^\$[\d,]+\+?$')


def run(
    playwright: Playwright,
    url: str = "https://www.rent.com/illinois/chicago-apartments/2-bedrooms",
    max_results: int = 5,
) -> list:
    print(f"  URL: {url}\n")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("rent_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        print(f"Loading {url}...")
        page.goto(url, wait_until="domcontentloaded")
        page.wait_for_timeout(10000)
        print(f"  Loaded: {page.url}")

        text = page.evaluate("document.body ? document.body.innerText : ''") or ""
        text_lines = [l.strip() for l in text.split("\n") if l.strip()]

        # Skip to search results ('Rentals Available')
        i = 0
        while i < len(text_lines):
            if 'Rentals Available' in text_lines[i]:
                i += 1
                break
            i += 1

        # Skip 'Sort by:' and 'Best Match'
        while i < len(text_lines) and text_lines[i] in ('Sort by:', 'Best Match'):
            i += 1

        while i < len(text_lines) and len(results) < max_results:
            line = text_lines[i]

            # 'Save' marker appears right after price in each listing
            if line == 'Save' and i > 0 and i + 5 < len(text_lines):
                price = text_lines[i - 1]
                if PRICE_RE.match(price) or price == 'Contact for Price':
                    beds = text_lines[i + 1]
                    bath = text_lines[i + 2]
                    sqft = text_lines[i + 3]
                    address = text_lines[i + 4]
                    name = text_lines[i + 5]

                    # Extract neighborhood from address
                    neighborhood = address.split(', ')[1] if ', ' in address else 'N/A'

                    results.append({
                        'name': name,
                        'price': price,
                        'bedrooms': beds,
                        'neighborhood': address,
                    })

            i += 1

        print("=" * 60)
        print("Apartments in Chicago, IL (2+ bed)")
        print("=" * 60)
        for idx, r in enumerate(results, 1):
            print(f"\n{idx}. {r['name']}")
            print(f"   Price:    {r['price']}")
            print(f"   Beds:     {r['bedrooms']}")
            print(f"   Address:  {r['neighborhood']}")

        print(f"\nFound {len(results)} listings")

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