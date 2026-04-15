"""
Playwright script (Python) — Thumbtack Service Professional Search
Search for local service professionals by category and location.
Extract name, rating, number of reviews, and starting price.

URL pattern: https://www.thumbtack.com/{state}/{city}/{service-slug}/
"""

import re
import os
import sys
import shutil
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws


def run(
    playwright: Playwright,
    service: str = "house cleaning",
    location: str = "Portland, OR",
    max_results: int = 5,
) -> list:
    print(f"  Service: {service}")
    print(f"  Location: {location}")
    print(f"  Max results: {max_results}\n")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("thumbtack_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        # ── Build URL from location and service ──────────────────────────
        # Location format: "Portland, OR" -> state="or", city="portland"
        loc_parts = [p.strip() for p in location.split(",")]
        city = loc_parts[0].lower().replace(" ", "-")
        state = loc_parts[1].lower().strip() if len(loc_parts) > 1 else ""
        service_slug = service.lower().replace(" ", "-")

        search_url = f"https://www.thumbtack.com/{state}/{city}/{service_slug}/"
        print(f"Loading {search_url}...")
        page.goto(search_url, timeout=30000)
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(2000)
        print(f"  Loaded: {page.url}")
        print(f"  Title: {page.title()}")

        # ── Wait for pro listings ─────────────────────────────────────────
        try:
            page.locator('[data-testid="pro-list-result-review"]').first.wait_for(
                state="visible", timeout=10000
            )
        except Exception:
            pass
        page.wait_for_timeout(2000)

        # ── Extract professionals via body text ───────────────────────────
        print(f"\nExtracting up to {max_results} professionals...")

        body = page.locator("body").inner_text(timeout=5000)
        lines = [l.strip() for l in body.split("\n") if l.strip()]

        # Pattern: pro name is the line BEFORE a rating line.
        # Rating line: "Excellent 4.9" or "Great 4.7" or "Exceptional 5.0"
        # Review count follows as "(N)"
        # Names are NOT numbered in the body text.
        rating_re = re.compile(r"^(?:Excellent|Great|Exceptional|Good|OK)\s+(\d\.\d)$")
        i = 0
        while i < len(lines) and len(results) < max_results:
            rm = rating_re.match(lines[i])
            if rm:
                rating = rm.group(1)
                # Name is 1 or 2 lines before (skip "Top Pro" / "New on Thumbtack")
                name = "N/A"
                for delta in [1, 2]:
                    idx = i - delta
                    if idx >= 0:
                        cand = lines[idx]
                        if cand not in (
                            "Top Pro", "New on Thumbtack", "Recommended",
                            "Highest rated", "Most hires", "Fastest response",
                            "View profile", "See more",
                        ) and len(cand) > 2 and not rating_re.match(cand):
                            # Strip leading "N. " numbering if present
                            name = re.sub(r"^\d+\.\s+", "", cand)
                            break

                # Review count: "(N)" on the next line
                reviews = "N/A"
                if i + 1 < len(lines):
                    rvm = re.match(r"^\((\d+)\)$", lines[i + 1])
                    if rvm:
                        reviews = rvm.group(1)

                # Price: not shown on listing page
                price = "N/A"

                if name != "N/A":
                    results.append({
                        "name": name,
                        "rating": rating,
                        "reviews": reviews,
                        "price": price,
                    })
                i += 2
                continue
            i += 1

        # ── Print results ─────────────────────────────────────────────────
        print(f'\nFound {len(results)} professionals for "{service}" in {location}:\n')
        for idx, p in enumerate(results, 1):
            print(f"  {idx}. {p['name']}")
            print(f"     Rating: {p['rating']}  Reviews: {p['reviews']}  Price: {p['price']}")
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
        print(f"\nTotal professionals found: {len(items)}")
