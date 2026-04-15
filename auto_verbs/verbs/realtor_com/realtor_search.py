"""
Auto-generated Playwright script (Python)
Realtor.com - Home Search
Location: Austin, TX, Price: $300000-$500000

Generated on: 2026-04-15T22:05:17.989Z
Recorded 1 browser interactions
"""

import re
import os, sys, shutil
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws


PRICE_RE = re.compile(r'^(?:From)?\$([\d,]+)')
BED_RE = re.compile(r'^(\d+)bed$')
BATH_RE = re.compile(r'^([\d.]+)bath$')
SQFT_RE = re.compile(r'^([\d,]+)sqft$')


def run(
    playwright: Playwright,
    location: str = "Austin_TX",
    price_min: int = 300000,
    price_max: int = 500000,
    max_results: int = 5,
) -> list:
    print(f"  Location: {location}, Price: ${price_min:,}-${price_max:,}\n")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("realtor_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        url = f"https://www.realtor.com/realestateandhomes-search/{location}/price-{price_min}-{price_max}"
        print(f"Loading {url}...")
        page.goto(url, wait_until="domcontentloaded")
        page.wait_for_timeout(10000)
        print(f"  Loaded: {page.url}")

        text = page.evaluate("document.body ? document.body.innerText : ''") or ""
        text_lines = [l.strip() for l in text.split("\n") if l.strip()]

        # Note: realtor.com may block fresh CDP Chrome profiles
        if any('could not be processed' in l for l in text_lines[:5]):
            print("  WARNING: Request blocked by realtor.com bot detection.")
            print("  The JS/Stagehand version works correctly.")

        i = 0
        while i < len(text_lines) and len(results) < max_results:
            line = text_lines[i]

            if line == 'House for sale' and i + 1 < len(text_lines):
                pm = PRICE_RE.match(text_lines[i + 1])
                if pm:
                    price = text_lines[i + 1]
                    j = i + 2

                    # Skip optional price adjustments like '$500' or '$10k'
                    if j < len(text_lines) and PRICE_RE.match(text_lines[j]) and len(text_lines[j]) < 8:
                        j += 1

                    bed = 'N/A'
                    bath = 'N/A'
                    sqft = 'N/A'
                    address = 'N/A'

                    # Parse bed, bath, sqft
                    while j < min(i + 10, len(text_lines)):
                        bm = BED_RE.match(text_lines[j])
                        if bm:
                            bed = bm.group(1)
                            j += 1
                            continue
                        btm = BATH_RE.match(text_lines[j])
                        if btm:
                            bath = btm.group(1)
                            j += 1
                            continue
                        sm = SQFT_RE.match(text_lines[j])
                        if sm:
                            sqft = sm.group(1)
                            j += 1
                            break
                        j += 1

                    # Skip 'X square feet' and optional lot lines
                    while j < min(i + 15, len(text_lines)):
                        if 'square feet' in text_lines[j] or 'square foot' in text_lines[j] or text_lines[j].endswith('sqft lot'):
                            j += 1
                        else:
                            break

                    # Address is the next 2 lines
                    if j + 1 < len(text_lines):
                        street = text_lines[j]
                        city_state = text_lines[j + 1]
                        address = f'{street}, {city_state}'

                    results.append({
                        'address': address,
                        'price': price,
                        'bedrooms': bed,
                        'bathrooms': bath,
                        'sqft': sqft,
                    })

            i += 1

        print("=" * 60)
        loc_label = location.replace("_", ", ")
        print(f"Homes for sale in {loc_label}")
        print("=" * 60)
        for idx, r in enumerate(results, 1):
            print(f"\n{idx}. {r['address']}")
            print(f"   Price:     {r['price']}")
            print(f"   Bedrooms:  {r['bedrooms']}")
            print(f"   Bathrooms: {r['bathrooms']}")
            print(f"   Sqft:      {r['sqft']}")

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