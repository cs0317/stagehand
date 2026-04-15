"""
Auto-generated Playwright script (Python)
Hostelworld - Hostel Search
City: Barcelona

Generated on: 2026-04-15T21:20:09.248Z
Recorded 1 browser interactions
"""

import re
import os, sys, shutil
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws


RATING_RE = re.compile(r'^\d+\.\d$')
RATING_LABELS = {'Superb', 'Fabulous', 'Very Good', 'Good', 'Average'}
PRICE_RE = re.compile(r'^US\$[\d,.]+$')
DIST_RE = re.compile(r'^[\d.]+km from city centre$')


def run(
    playwright: Playwright,
    city: str = "Barcelona",
    guests: int = 2,
    max_results: int = 5,
) -> list:
    print(f"  City: {city}")
    print(f"  Guests: {guests}\n")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("hostelworld_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        url = f"https://www.hostelworld.com/hostels/{city}"
        print(f"Loading {url}...")
        page.goto(url)
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(10000)
        print(f"  Loaded: {page.url}")

        text = page.evaluate("document.body ? document.body.innerText : ''") or ""
        text_lines = [l.strip() for l in text.split("\n") if l.strip()]

        # Parse hostel listings
        # Pattern: 'Hostel' marker -> name -> rating -> label -> (count) -> distance -> ... -> Dorms From -> price
        i = 0
        while i < len(text_lines) and len(results) < max_results:
            line = text_lines[i]
            if line == "Hostel" and i + 1 < len(text_lines):
                name = text_lines[i + 1] if i + 1 < len(text_lines) else ""
                rating = ""
                distance = "N/A"
                price = "N/A"

                # Look forward for rating, distance, price
                for j in range(i + 2, min(i + 20, len(text_lines))):
                    jline = text_lines[j]
                    if RATING_RE.match(jline) and not rating:
                        label = text_lines[j + 1] if j + 1 < len(text_lines) else ""
                        rating = jline + " " + label if label in RATING_LABELS else jline
                    elif DIST_RE.match(jline):
                        distance = jline
                    elif jline == "Dorms From" and j + 1 < len(text_lines):
                        price = text_lines[j + 1]
                        break
                    elif jline == "Hostel":
                        # reached next listing, take what we have
                        break

                if name:
                    results.append({
                        "name": name,
                        "price": price,
                        "rating": rating,
                        "distance": distance,
                    })
                i += 2
            else:
                i += 1

        print("=" * 60)
        print(f"Hostels in {city}")
        print("=" * 60)
        for idx, r in enumerate(results, 1):
            print(f"\n{idx}. {r['name']}")
            print(f"   Price/night: {r['price']}")
            print(f"   Rating:      {r['rating']}")
            print(f"   Distance:    {r['distance']}")

        print(f"\nFound {len(results)} hostels")

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