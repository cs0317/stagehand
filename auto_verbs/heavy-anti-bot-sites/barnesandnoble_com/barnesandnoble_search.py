"""
Auto-generated Playwright script (Python)
Barnes & Noble – Book Search
Query: Brandon Sanderson   Max results: 5

Generated on: 2026-04-15T20:00:21.892Z
"""

import re
import os, sys, shutil
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws


def run(
    playwright: Playwright,
    query: str = "Brandon Sanderson",
    max_results: int = 5,
) -> list:
    print(f"  Query: {query}  Max results: {max_results}\n")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("barnesandnoble_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        # ── Navigate ──────────────────────────────────────────────────
        print("Loading Barnes & Noble search results...")
        search_url = "https://www.barnesandnoble.com/s/" + query.replace(" ", "+")
        page.goto(search_url)
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(5000)
        print(f"  Loaded: {page.url}")

        # ── Extract books ─────────────────────────────────────────────
        print(f"Extracting up to {max_results} books...")

        tiles = page.query_selector_all(".product-shelf-tile")
        for tile in tiles[:max_results]:
            # Title from the <a title="..."> link
            link = tile.query_selector("a[title]")
            title = link.get_attribute("title") if link else "N/A"

            # Format from .format span
            fmt_el = tile.query_selector(".product-shelf-pricing .format")
            fmt = fmt_el.inner_text().strip() if fmt_el else "N/A"

            # Price from current price span (not .format, not .previous)
            price = "N/A"
            price_spans = tile.query_selector_all(".product-shelf-pricing .current a span")
            for sp in price_spans:
                txt = sp.inner_text().strip()
                if txt.startswith("$"):
                    price = txt
                    break

            # Rating: not shown in search results — mark N/A
            rating = "N/A"

            results.append({
                "title": title,
                "format": fmt,
                "price": price,
                "rating": rating,
            })

        # ── Print results ─────────────────────────────────────────────
        print(f"\nFound {len(results)} books:\n")
        for i, book in enumerate(results, 1):
            print(f"  {i}. {book['title']}")
            print(f"     Format: {book['format']}  Price: {book['price']}  Rating: {book['rating']}")
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
        print(f"\nTotal books found: {len(items)}")
