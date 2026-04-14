"""
Booking.com – Attractions Search
Search for attractions in a city and extract name, rating, and price.

Uses Playwright via CDP connection with the user's Chrome profile.
"""

import re
import os, sys, shutil
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws


def run(
    playwright: Playwright,
    city: str = "Paris",
    max_results: int = 5,
) -> list:
    print(f"  City: {city}")
    print(f"  Max results: {max_results}\n")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("booking_com_attractions")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        # ── Navigate ──────────────────────────────────────────────────────
        print("Loading Booking.com Attractions...")
        page.goto("https://www.booking.com/attractions")
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(3000)

        # ── Dismiss popups / cookie banners ───────────────────────────────
        for selector in [
            "button#onetrust-accept-btn-handler",
            "[aria-label='Dismiss sign-in info.']",
            "button:has-text('Accept')",
            "button:has-text('Got it')",
        ]:
            try:
                btn = page.locator(selector).first
                if btn.is_visible(timeout=1500):
                    btn.evaluate("el => el.click()")
                    page.wait_for_timeout(500)
            except Exception:
                pass

        # ── STEP 1: Search for attractions ────────────────────────────────
        print(f'STEP 1: Search for attractions in "{city}"...')

        search_input = page.locator('[data-testid="search-input-field"]').first
        search_input.evaluate("el => el.click()")
        page.wait_for_timeout(500)
        page.keyboard.press("Control+a")
        search_input.fill(city)
        page.wait_for_timeout(2000)

        # Try to select first autocomplete suggestion
        try:
            suggestion = page.locator('[data-testid="search-bar-result"]').first
            suggestion.wait_for(state="visible", timeout=5000)
            suggestion.evaluate("el => el.click()")
            print(f"  Selected first suggestion for \"{city}\"")
            page.wait_for_timeout(2000)
        except Exception:
            print("  No autocomplete suggestion found")

        # Click the search button
        search_btn = page.locator('[data-testid="search-button"]').first
        search_btn.evaluate("el => el.click()")
        print("  Clicked Search button")
        page.wait_for_timeout(2000)

        # Wait for results page to load
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(3000)
        print(f"  URL: {page.url}")

        # ── STEP 2: Extract attractions ───────────────────────────────────
        print(f"STEP 2: Extract up to {max_results} attractions...")

        cards = page.locator('[data-testid="card"]')
        count = cards.count()
        print(f"  Found {count} attraction cards")

        for i in range(min(count, max_results)):
            card = cards.nth(i)
            try:
                # Name
                name = "N/A"
                try:
                    name_el = card.locator('[data-testid="card-title"]').first
                    name = name_el.inner_text(timeout=2000).strip()
                except Exception:
                    pass

                # Rating
                rating = "N/A"
                try:
                    review_el = card.locator('[data-testid="review-score"]').first
                    review_text = review_el.inner_text(timeout=2000).strip()
                    # Format: "User reviews, 8.8 out of 10 from 7272 reviews\n8.8\nExcellent\n· 7272 reviews"
                    m = re.search(r"(\d+(?:\.\d+)?)\s+out\s+of\s+10", review_text)
                    if m:
                        rating = m.group(1)
                    else:
                        # Fallback: grab first number on its own line
                        m2 = re.search(r"\n(\d+(?:\.\d+)?)\n", review_text)
                        if m2:
                            rating = m2.group(1)
                except Exception:
                    pass

                # Price
                price = "N/A"
                try:
                    price_el = card.locator('[data-testid="price"]').first
                    price_text = price_el.inner_text(timeout=2000).strip()
                    # Format: "From\nUS$81\nCurrent price from US$81"
                    m = re.search(r"(US?\$[\d,.]+|€[\d,.]+|£[\d,.]+)", price_text)
                    if m:
                        price = m.group(1)
                except Exception:
                    pass

                results.append({
                    "name": name,
                    "rating": rating,
                    "price": price,
                })

            except Exception as e:
                print(f"  Skipping card {i + 1}: {e}")

        # ── Print results ─────────────────────────────────────────────────
        print(f"\nResults for attractions in '{city}':")
        for i, r in enumerate(results, 1):
            print(f"  {i}. {r['name']}")
            print(f"     Rating: {r['rating']}")
            print(f"     Price:  {r['price']}")

    finally:
        browser.close()
        chrome_proc.kill()
        shutil.rmtree(profile_dir, ignore_errors=True)

    # ── Summary ───────────────────────────────────────────────────────────
    print(f"\n--- Summary ---")
    for r in results:
        print(f"  name: {r['name']}, rating: {r['rating']}, price: {r['price']}")
    return results


if __name__ == "__main__":
    with sync_playwright() as pw:
        run(pw)
