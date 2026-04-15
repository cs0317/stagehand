"""
Playwright script (Python) — TripAdvisor Restaurant Search
Search for restaurants by city and extract name, cuisine, rating, and price level.

Uses Google redirect to bypass TripAdvisor challenge pages
(same approach as verbs-batch2/tripadvisor_com/tripadvisor_hotels.py).
"""

import re
import os
import sys
import shutil
import urllib.parse
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws


def run(
    playwright: Playwright,
    destination: str = "New Orleans, LA",
    max_results: int = 5,
) -> list:
    print(f"  Destination: {destination}")
    print(f"  Max results: {max_results}\n")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("tripadvisor_restaurants")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        # ── Navigate via Google redirect ──────────────────────────────────
        # TripAdvisor uses bot detection; Google redirect bypasses it
        # (same approach as verbs-batch2/tripadvisor_com)
        google_q = urllib.parse.quote(f"site:tripadvisor.com Restaurants {destination}")
        google_url = f"https://www.google.com/search?q={google_q}"
        print(f"Loading Google: {google_url}...")
        page.goto(google_url, timeout=30000)
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(2000)

        # Find the TripAdvisor restaurants link
        links = page.locator('a[href*="tripadvisor.com/Restaurants-"]')
        lc = links.count()
        print(f"  Found {lc} TripAdvisor restaurant links")

        if lc == 0:
            print("  No TripAdvisor links found on Google. Aborting.")
            return results

        href = links.first.get_attribute("href", timeout=5000)
        print(f"  Navigating to TripAdvisor...")
        page.goto(href, timeout=30000)
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(2000)

        # Handle challenge page (title == "tripadvisor.com")
        if page.title() == "tripadvisor.com":
            print("  Challenge page detected, reloading...")
            page.reload()
            page.wait_for_load_state("domcontentloaded")
            page.wait_for_timeout(2000)

        print(f"  Loaded: {page.title()}")
        print(f"  URL: {page.url}")

        # ── Extract restaurants via body text parsing ─────────────────────
        print(f"\nExtracting up to {max_results} restaurants...")

        body = page.locator("body").inner_text(timeout=5000)
        lines = [l.strip() for l in body.split("\n") if l.strip()]

        # Pattern for numbered restaurants in the main list:
        #   "N. Restaurant Name"  (e.g. "1. Cochon Restaurant")
        #   "X.X"                 (rating)
        #   "(N reviews)"
        #   "Cuisine1, Cuisine2"  (cuisine types)
        #   "$$ - $$$"            (price level)
        i = 0
        while i < len(lines) and len(results) < max_results:
            # Look for numbered restaurant name (e.g. "1. Cochon Restaurant")
            m = re.match(r"^\d+\.\s+(.+)$", lines[i])
            if m:
                name = m.group(1).strip()
                # Next line should be rating like "4.4"
                if i + 1 < len(lines) and re.match(r"^\d\.\d$", lines[i + 1]):
                    rating = lines[i + 1]
                    # Next: "(N reviews)"
                    reviews = ""
                    if i + 2 < len(lines) and "review" in lines[i + 2].lower():
                        reviews = lines[i + 2]
                    # Next: cuisine type (e.g. "American, Cajun & Creole")
                    cuisine = "N/A"
                    if i + 3 < len(lines):
                        cand = lines[i + 3]
                        # Cuisine line doesn't start with $ and isn't a badge
                        if not cand.startswith("$") and not re.match(r"^\d", cand):
                            cuisine = cand
                    # Next: price level (e.g. "$$ - $$$" or "$$$$" or "$")
                    price_level = "N/A"
                    if i + 4 < len(lines):
                        cand = lines[i + 4]
                        if re.match(r"^\$", cand):
                            price_level = cand
                    # Also check line i+3 for combined "Cuisine • $$ - $$$"
                    if cuisine != "N/A" and " • " in cuisine:
                        parts = cuisine.split(" • ", 1)
                        cuisine = parts[0].strip()
                        price_level = parts[1].strip()

                    results.append({
                        "name": name,
                        "cuisine": cuisine,
                        "rating": rating,
                        "price_level": price_level,
                    })
                    i += 5
                    continue
            i += 1

        # ── Print results ─────────────────────────────────────────────────
        print(f'\nFound {len(results)} restaurants in "{destination}":\n')
        for idx, r in enumerate(results, 1):
            print(f"  {idx}. {r['name']}")
            print(f"     Cuisine: {r['cuisine']}  Rating: {r['rating']}  Price: {r['price_level']}")
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
        print(f"\nTotal restaurants found: {len(items)}")
