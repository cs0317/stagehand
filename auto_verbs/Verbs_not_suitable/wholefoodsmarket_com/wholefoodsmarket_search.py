"""
Auto-generated Playwright script (Python)
Whole Foods Market – Product Search
Query: organic coffee
Max results: 5

NOTE: The WFM grocery search is powered by Amazon Fresh and requires
Amazon sign-in to display product results. This script uses cdp_utils
to launch Chrome with the user's profile. It will work correctly when
the user's Chrome profile has an active Amazon session.

Steps:
  1. Navigate to https://www.wholefoodsmarket.com
  2. Enter the search query in the search box (data-testid="search-input")
  3. Wait for the grocery search results page to load
  4. Extract up to max_results products with name, price, and size/weight
  5. Print the list
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
    query: str = "organic coffee",
    max_results: int = 5,
) -> list:
    print(f"  Query: {query}")
    print(f"  Max results: {max_results}\n")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("wholefoodsmarket_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        # ── Navigate to WFM ──────────────────────────────────────────────
        print("Loading Whole Foods Market...")
        page.goto("https://www.wholefoodsmarket.com", timeout=30000)
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(3000)
        print(f"  Loaded: {page.url}")

        # ── STEP 1: Enter search query ────────────────────────────────────
        print(f'STEP 1: Searching for "{query}"...')

        # The search box is present in both desktop and mobile nav
        # data-testid="search-input" is stable
        search_input = page.locator('[data-testid="search-input"]').first
        search_input.evaluate("el => el.click()")
        page.wait_for_timeout(500)
        page.keyboard.press("Control+a")
        search_input.type(query, delay=50)
        print(f'  Typed "{query}"')
        page.wait_for_timeout(1000)

        # Press Enter to navigate to search results
        page.keyboard.press("Enter")
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(2000)
        print(f"  URL after search: {page.url}")

        # ── STEP 2: Wait for product results ─────────────────────────────
        print("STEP 2: Waiting for product results to load...")

        # The grocery search page (/grocery/search?k=...) is Amazon Fresh-powered.
        # Products load only when the user is signed in to Amazon.
        # Wait up to 15 seconds for product prices to appear in the page text.
        product_loaded = False
        body_text = ""
        for _ in range(5):
            page.wait_for_timeout(3000)
            body_text = page.evaluate("document.body.innerText") or ""
            # Products are present when price patterns like $X.XX appear in main content
            if re.search(r"\$\d+\.\d{2}", body_text):
                product_loaded = True
                break

        if not product_loaded:
            print(
                "\n  ⚠ Products did not load. The WFM grocery search requires Amazon sign-in.\n"
                "  Please sign in to your Amazon account in Chrome and re-run this script.\n"
            )
            return results

        # ── STEP 3: Extract products ──────────────────────────────────────
        print(f"STEP 3: Extracting up to {max_results} products...")

        # Strategy A: Try data-testid-based product tile selectors
        # (populate if WFM adds them in a future release)
        card_selectors = [
            '[data-testid="product-tile"]',
            '[data-testid="grid-product-tile"]',
            'li[class*="product"]',
            '[class*="ProductCard"]',
            '[class*="product-card"]',
        ]
        cards = None
        for sel in card_selectors:
            count = page.locator(sel).count()
            if count > 0:
                cards = page.locator(sel)
                print(f"  Using selector: {sel} ({count} cards)")
                break

        if cards and cards.count() > 0:
            for i in range(min(cards.count(), max_results)):
                card = cards.nth(i)
                try:
                    text = card.inner_text(timeout=3000).strip()
                    lines = [ln.strip() for ln in text.split("\n") if ln.strip()]

                    name = "N/A"
                    price = "N/A"
                    size = "N/A"

                    # Name: first non-price, non-percentage line of reasonable length
                    for ln in lines:
                        if (
                            len(ln) > 3
                            and not re.match(r"^\$[\d.,]+", ln)
                            and not re.match(r"^\d+%", ln)
                            and "Join Prime" not in ln
                            and "Add to cart" not in ln.lower()
                        ):
                            name = ln
                            break

                    # Price: first line matching $X.XX or $X.XX/lb etc.
                    for ln in lines:
                        m = re.search(r"\$[\d]+\.[\d]{2}", ln)
                        if m:
                            price = m.group(0)
                            break

                    # Size: look for weight/volume patterns
                    for ln in lines:
                        m = re.search(
                            r"(\d+\.?\d*\s*(?:oz|lb|lbs|g|kg|fl oz|ml|ct|count|pack))",
                            ln,
                            re.IGNORECASE,
                        )
                        if m:
                            size = m.group(1)
                            break

                    if name == "N/A":
                        continue
                    results.append({"name": name, "price": price, "size": size})
                except Exception:
                    continue

        # Strategy B: Parse body text if card-based extraction failed
        if not results:
            print("  Card extraction failed, trying body text parse...")
            body_text = page.evaluate("document.body.innerText") or ""
            lines = [ln.strip() for ln in body_text.split("\n") if ln.strip()]

            i = 0
            while i < len(lines) and len(results) < max_results:
                ln = lines[i]
                price_match = re.search(r"\$[\d]+\.[\d]{2}", ln)
                if price_match:
                    price = price_match.group(0)
                    # product name is usually on the line before or after price
                    name = "N/A"
                    for delta in [-1, 1, -2, 2]:
                        idx = i + delta
                        if 0 <= idx < len(lines):
                            candidate = lines[idx]
                            if (
                                len(candidate) > 3
                                and not re.match(r"^\$", candidate)
                                and not re.match(r"^\d+%", candidate)
                                and "Join Prime" not in candidate
                                and len(candidate) < 120
                            ):
                                name = candidate
                                break

                    size = "N/A"
                    # look nearby for size
                    for delta in range(-2, 3):
                        idx = i + delta
                        if 0 <= idx < len(lines):
                            m = re.search(
                                r"(\d+\.?\d*\s*(?:oz|lb|lbs|g|kg|fl oz|ml|ct|count|pack))",
                                lines[idx],
                                re.IGNORECASE,
                            )
                            if m:
                                size = m.group(1)
                                break

                    if name != "N/A":
                        results.append({"name": name, "price": price, "size": size})
                i += 1

        # ── STEP 4: Print results ─────────────────────────────────────────
        print(f'\nFound {len(results)} products for "{query}":\n')
        for idx, p in enumerate(results, 1):
            print(f"  {idx}. {p['name']}")
            print(f"     Price: {p['price']}   Size: {p['size']}")
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
        print(f"Total products found: {len(items)}")
