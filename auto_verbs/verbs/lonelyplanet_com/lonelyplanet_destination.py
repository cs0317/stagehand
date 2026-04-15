"""
Auto-generated Playwright script (Python)
Lonely Planet - Destination Guide
Destination: Tokyo

Generated on: 2026-04-15T21:25:02.722Z
Recorded 1 browser interactions
"""

import re
import os, sys, shutil
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws


ATTRACTION_RE = re.compile(r'^ATTRACTION IN (.+)$')


def run(
    playwright: Playwright,
    country: str = "japan",
    destination: str = "tokyo",
    max_attractions: int = 5,
) -> dict:
    print(f"  Destination: {destination.title()}")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("lonelyplanet_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    result = {}

    try:
        url = f"https://www.lonelyplanet.com/{country}/{destination}"
        print(f"Loading {url}...")
        page.goto(url)
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(8000)
        print(f"  Loaded: {page.url}")

        text = page.evaluate("document.body ? document.body.innerText : ''") or ""
        text_lines = [l.strip() for l in text.split("\n") if l.strip()]

        # Extract overview (line after 'Why visit {destination}')
        overview = None
        best_time = None
        attractions = []

        i = 0
        while i < len(text_lines):
            line = text_lines[i]

            # Overview
            if line.lower().startswith('why visit') and i + 1 < len(text_lines):
                overview = text_lines[i + 1]

            # Best time to visit
            if line == "BEST TIME TO VISIT" and i + 1 < len(text_lines):
                best_time = text_lines[i + 1]

            # Attractions
            m = ATTRACTION_RE.match(line)
            if m and len(attractions) < max_attractions and i + 1 < len(text_lines):
                area = m.group(1).title()
                name = text_lines[i + 1]
                if name != "DISCOVER":
                    attractions.append({'name': name, 'area': area})

            i += 1

        dest_title = destination.title()
        print("=" * 60)
        print(f"Lonely Planet: {dest_title} Destination Guide")
        print("=" * 60)
        print(f"\nOverview:")
        print(f"  {overview or 'N/A'}")
        print(f"\nBest Time to Visit:")
        print(f"  {best_time or 'N/A'}")
        print(f"\nTop Attractions:")
        for idx, a in enumerate(attractions, 1):
            print(f"  {idx}. {a['name']}")
            print(f"     Area: {a['area']}")

        result = {
            "destination": dest_title,
            "overview": overview,
            "best_time": best_time,
            "attractions": attractions,
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