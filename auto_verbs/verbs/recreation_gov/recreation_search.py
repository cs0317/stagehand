"""
Auto-generated Playwright script (Python)
Recreation.gov - Campground Search
Query: Yellowstone

Generated on: 2026-04-15T22:07:58.776Z
Recorded 1 browser interactions
"""

import re
import os, sys, shutil
from urllib.parse import quote_plus
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws


PRICE_RE = re.compile(r'^\$[\d,]+(?: \u2013 \$[\d,]+)?$')
SITES_RE = re.compile(r'^(\d+) Accessible Campsite')


def run(
    playwright: Playwright,
    query: str = "Yellowstone",
    max_results: int = 5,
) -> list:
    print(f"  Query: {query}\n")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("recreation_gov")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        url = f"https://www.recreation.gov/search?q={quote_plus(query)}&entity_type=campground"
        print(f"Loading {url}...")
        page.goto(url, wait_until="domcontentloaded")
        page.wait_for_timeout(8000)
        print(f"  Loaded: {page.url}")

        text = page.evaluate("document.body ? document.body.innerText : ''") or ""
        text_lines = [l.strip() for l in text.split("\n") if l.strip()]

        i = 0
        while i < len(text_lines) and len(results) < max_results:
            if text_lines[i] == 'CAMPING':
                name = text_lines[i + 1] if i + 1 < len(text_lines) else 'Unknown'

                # Find location ('Near ...') and fee within next 15 lines
                location = 'N/A'
                fee = 'N/A'
                sites = 'N/A'
                for j in range(i + 2, min(i + 15, len(text_lines))):
                    if text_lines[j].startswith('Near '):
                        location = text_lines[j].replace('Near ', '')
                    sm = SITES_RE.match(text_lines[j])
                    if sm:
                        sites = sm.group(1)
                    if PRICE_RE.match(text_lines[j]):
                        fee = text_lines[j] + ' / night'
                        break

                results.append({
                    'name': name,
                    'location': location,
                    'sites': sites,
                    'fee': fee,
                })

            i += 1

        print("=" * 60)
        print(f"Campgrounds near {query}")
        print("=" * 60)
        for idx, r in enumerate(results, 1):
            print(f"\n{idx}. {r['name']}")
            print(f"   Location: {r['location']}")
            print(f"   Sites:    {r['sites']}")
            print(f"   Fee:      {r['fee']}")

        print(f"\nFound {len(results)} campgrounds")

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