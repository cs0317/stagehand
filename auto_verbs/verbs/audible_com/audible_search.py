"""
Auto-generated Playwright script (Python)
Audible.com – Audiobook Search
Query: science fiction
Max results: 5

Generated on: 2026-04-15T19:38:40.143Z
Recorded 2 browser interactions
"""

import re
import os, sys, shutil
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws


def run(
    playwright: Playwright,
    query: str = "science fiction",
    max_results: int = 5,
) -> list:
    print(f"  Query: {query}")
    print(f"  Max results: {max_results}\n")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("audible_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        # ── Navigate to search results ────────────────────────────────────
        search_query = query.replace(" ", "+")
        search_url = f"https://www.audible.com/search?keywords={search_query}"
        print(f"Loading {search_url}...")
        page.goto(search_url)
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(5000)
        print(f"  Loaded: {page.url}")

        # ── Extract audiobooks ────────────────────────────────────────────
        print(f"Extracting up to {max_results} audiobooks...")

        # Audible product items: li.productListItem
        product_items = page.locator("li.productListItem")
        count = product_items.count()
        print(f"  Found {count} product items on page")

        for i in range(min(count, max_results)):
            item = product_items.nth(i)
            try:
                text = item.inner_text(timeout=3000)

                # Title from aria-label
                title = item.get_attribute("aria-label", timeout=2000) or "N/A"

                # Author: "By: AuthorName"
                author = "N/A"
                m = re.search(r"By:\s*(.+?)\n", text)
                if m:
                    author = m.group(1).strip()

                # Narrator: "Narrated by: NarratorName"
                narrator = "N/A"
                m = re.search(r"Narrated by:\s*(.+?)\n", text)
                if m:
                    narrator = m.group(1).strip()

                # Length: "Length: X hrs and Y mins"
                length = "N/A"
                m = re.search(r"Length:\s*(.+?)\n", text)
                if m:
                    length = m.group(1).strip()

                # Rating: a number like "4.2" followed by "X ratings"
                rating = "N/A"
                m = re.search(r"(\d+\.\d+)\s*\n?\s*\d+\s*ratings?", text)
                if m:
                    rating = m.group(1)

                if title == "N/A":
                    continue

                results.append({
                    "title": title,
                    "author": author,
                    "narrator": narrator,
                    "length": length,
                    "rating": rating,
                })
            except Exception:
                continue

        # ── Print results ─────────────────────────────────────────────────
        print(f"\nFound {len(results)} audiobooks for '{query}':\n")
        for i, book in enumerate(results, 1):
            print(f"  {i}. {book['title']}")
            print(f"     Author: {book['author']}")
            print(f"     Narrator: {book['narrator']}")
            print(f"     Length: {book['length']}")
            print(f"     Rating: {book['rating']}")
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
        print(f"\nTotal audiobooks found: {len(items)}")
