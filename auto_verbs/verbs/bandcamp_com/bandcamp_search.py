"""
Auto-generated Playwright script (Python)
Bandcamp.com – Album Search
Query: jazz
Max results: 5

Generated on: 2026-04-15T19:49:14.748Z
Recorded 2 browser interactions
"""

import re
import os, sys, shutil
from urllib.parse import quote_plus
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws


def run(
    playwright: Playwright,
    query: str = "jazz",
    max_results: int = 5,
) -> list:
    print(f"  Query: {query}")
    print(f"  Max results: {max_results}\n")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("bandcamp_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        # ── Navigate to search results (item_type=a for albums) ──────────
        search_url = f"https://bandcamp.com/search?q={quote_plus(query)}&item_type=a"
        print(f"Loading {search_url}...")
        page.goto(search_url)
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(5000)
        print(f"  Loaded: {page.url}")

        # ── Extract albums ────────────────────────────────────────────────
        print(f"Extracting up to {max_results} albums...")

        # Bandcamp search results: li.searchresult
        result_items = page.locator("li.searchresult")
        count = result_items.count()
        print(f"  Found {count} search results")

        for i in range(min(count, max_results)):
            item = result_items.nth(i)
            try:
                # Album title from .heading
                title = "N/A"
                try:
                    title_el = item.locator(".heading").first
                    title = title_el.inner_text(timeout=3000).strip()
                except Exception:
                    pass

                # Artist from .subhead ("by ArtistName")
                artist = "N/A"
                try:
                    subhead_el = item.locator(".subhead").first
                    subhead_text = subhead_el.inner_text(timeout=3000).strip()
                    artist = re.sub(r"^by\s+", "", subhead_text).strip()
                except Exception:
                    pass

                # Genre tags from .tags
                tags = "N/A"
                try:
                    tags_el = item.locator(".tags").first
                    tags_text = tags_el.inner_text(timeout=3000).strip()
                    tags = re.sub(r"^tags:\s*", "", tags_text).strip()
                except Exception:
                    pass

                # Price: Bandcamp search results don't always show price
                # Try to find it in the item text
                price = "N/A"
                try:
                    item_text = item.inner_text(timeout=3000)
                    m = re.search(r"(\$[\d.]+|\xA3[\d.]+|\u20AC[\d.]+|name your price|free)", item_text, re.IGNORECASE)
                    if m:
                        price = m.group(1)
                except Exception:
                    pass

                if title == "N/A":
                    continue

                results.append({
                    "title": title,
                    "artist": artist,
                    "price": price,
                    "tags": tags,
                })
            except Exception:
                continue

        # ── Print results ─────────────────────────────────────────────────
        print(f"\nFound {len(results)} albums for '{query}':\n")
        for i, album in enumerate(results, 1):
            print(f"  {i}. {album['title']}")
            print(f"     Artist: {album['artist']}")
            print(f"     Price: {album['price']}")
            print(f"     Tags: {album['tags']}")
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
        print(f"\nTotal albums found: {len(items)}")
