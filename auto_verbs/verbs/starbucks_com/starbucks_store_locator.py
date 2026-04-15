"""
Playwright script (Python) — Starbucks Store Locator
Find stores near a given location.
Extract store name, address, hours, distance, and available features.

URL: https://www.starbucks.com/store-locator
"""

import re
import os
import sys
import shutil
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws


HOURS_RE = re.compile(
    r"^([\d.]+)\s+miles?\s+away\s+·\s+(.+)$"
)


def run(
    playwright: Playwright,
    location: str = "Manhattan, NY",
    max_results: int = 5,
) -> list:
    print(f"  Location: {location}")
    print(f"  Max results: {max_results}\n")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("starbucks_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        print("Loading Starbucks store locator...")
        page.goto("https://www.starbucks.com/store-locator", timeout=30000)
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(3000)

        # Accept cookies if present
        try:
            agree = page.locator('button:has-text("Agree")').first
            if agree.is_visible(timeout=2000):
                agree.click()
                page.wait_for_timeout(1000)
        except Exception:
            pass

        # Type location into search
        search = page.locator('input[data-e2e="searchTermInput"]').first
        search.click()
        page.wait_for_timeout(300)
        search.fill(location)
        page.wait_for_timeout(1500)
        page.keyboard.press("Enter")
        page.wait_for_timeout(8000)
        print(f"  Searched: {page.url}")

        body = page.locator("body").inner_text(timeout=10000)
        lines = [l.strip() for l in body.split("\n") if l.strip()]

        # Find "Stores near <location>" header
        start_idx = 0
        for i, l in enumerate(lines):
            if "Stores near" in l or "stores near" in l:
                start_idx = i + 1
                print(f"  Found results header at line {i}: {l}")
                break

        # Parse store blocks: name → address → distance/hours → order-type
        i = start_idx
        while i < len(lines) and len(results) < max_results:
            line = lines[i]
            m = HOURS_RE.match(line)
            if m:
                # This is a distance/hours line — the store block is:
                #   name = lines[i-2], address = lines[i-1]
                distance = m.group(1) + " miles"
                hours = m.group(2).strip()
                name = lines[i - 2] if i >= 2 else "N/A"
                address = lines[i - 1] if i >= 1 else "N/A"

                # Next line(s) may be ordering features
                features = []
                j = i + 1
                while j < len(lines):
                    cand = lines[j]
                    if cand in ("In store", "Order Here", "Pickup", "Delivery"):
                        features.append(cand)
                        j += 1
                    else:
                        break

                results.append({
                    "name": name,
                    "address": address,
                    "hours": hours,
                    "distance": distance,
                    "features": ", ".join(features) if features else "N/A",
                })
                i = j
                continue
            i += 1

        print(f'\nFound {len(results)} stores near "{location}":\n')
        for idx, s in enumerate(results, 1):
            print(f"  {idx}. {s['name']}")
            print(f"     Address: {s['address']}")
            print(f"     Hours: {s['hours']}")
            print(f"     Distance: {s['distance']}")
            print(f"     Features: {s['features']}")
            print()

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

    return results


if __name__ == "__main__":
    with sync_playwright() as playwright:
        items = run(playwright)
        print(f"\nTotal stores found: {len(items)}")
