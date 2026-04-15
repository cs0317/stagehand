"""
Auto-generated Playwright script (Python)
Rome2Rio - Travel Route Search
From: Paris To: Amsterdam

Generated on: 2026-04-15T22:12:20.504Z
Recorded 1 browser interactions
"""

import re
import os, sys, shutil
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws


TRANSPORT_TYPES = {'train', 'rideshare', 'bus', 'plane', 'car'}
DURATION_RE = re.compile(r'^\d+h(?:\s+\d+m)?$')
PRICE_RE = re.compile(r'^\$[\d,]+')


def run(
    playwright: Playwright,
    origin: str = "Paris",
    destination: str = "Amsterdam",
    max_results: int = 5,
) -> list:
    print(f"  From: {origin} To: {destination}\n")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("rome2rio_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        url = f"https://www.rome2rio.com/s/{origin}/{destination}"
        print(f"Loading {url}...")
        page.goto(url, wait_until="domcontentloaded")
        page.wait_for_timeout(10000)
        print(f"  Loaded: {page.url}")

        text = page.evaluate("document.body ? document.body.innerText : ''") or ""
        text_lines = [l.strip() for l in text.split("\n") if l.strip()]

        # Skip to route options (after 'Select an option below')
        i = 0
        while i < len(text_lines):
            if 'Select an option below' in text_lines[i]:
                i += 1
                break
            i += 1

        while i < len(text_lines) and len(results) < max_results:
            line = text_lines[i]

            if line in TRANSPORT_TYPES:
                # Look back for mode name
                mode = 'Unknown'
                for j in range(i - 1, max(i - 5, 0), -1):
                    t = text_lines[j]
                    if t in ('Train', 'Rideshare', 'Bus', 'Fly') or t.startswith('Drive'):
                        mode = t
                        break

                # Look forward for duration and price
                duration = 'N/A'
                price = 'N/A'
                for j in range(i + 1, min(i + 5, len(text_lines))):
                    if DURATION_RE.match(text_lines[j]) and duration == 'N/A':
                        duration = text_lines[j]
                    if PRICE_RE.match(text_lines[j]):
                        price = text_lines[j]
                        break

                results.append({
                    'mode': mode,
                    'duration': duration,
                    'price': price,
                })

            i += 1

        print("=" * 60)
        print(f"Travel: {origin} to {destination}")
        print("=" * 60)
        for idx, r in enumerate(results, 1):
            print(f"\n{idx}. {r['mode']}")
            print(f"   Duration: {r['duration']}")
            print(f"   Price:    {r['price']}")

        print(f"\nFound {len(results)} routes")

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