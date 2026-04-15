"""
Auto-generated Playwright script (Python)
USA.gov – Government Information Search
Query: passport renewal
Max results: 5

Uses Playwright with CDP connection to a real Chrome instance.
"""

import re
import os, sys, shutil
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws


def run(
    playwright: Playwright,
    query: str = "passport renewal",
    max_results: int = 5,
) -> list:
    print(f"  Query: {query}")
    print(f"  Max results: {max_results}\n")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("usa_gov")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        # ── Navigate directly to search results ──────────────────────────
        query_encoded = query.replace(" ", "+")
        search_url = f"https://search.usa.gov/search?affiliate=usagov_en_internal&query={query_encoded}"
        print(f"Loading {search_url}...")
        page.goto(search_url, timeout=30000)
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(2000)

        # ── Wait for results ─────────────────────────────────────────────
        print("Waiting for results...")
        try:
            page.locator(".result").first.wait_for(state="visible", timeout=10000)
        except Exception:
            pass
        page.wait_for_timeout(1000)
        print(f"  Loaded: {page.url}")

        # ── Extract results ──────────────────────────────────────────────
        print(f"Extracting up to {max_results} results...")

        cards = page.locator(".result")
        count = cards.count()
        print(f"  Found {count} result cards on page")

        for i in range(min(count, max_results)):
            card = cards.nth(i)
            try:
                text = card.inner_text(timeout=3000)
                lines = [ln.strip() for ln in text.split("\n") if ln.strip()]

                # Line 0: title (may contain <strong> markup in text form)
                title = lines[0] if len(lines) > 0 else "N/A"

                # Line 1: description
                description = lines[1] if len(lines) > 1 else "N/A"

                # Line 2: URL
                url = lines[2] if len(lines) > 2 else "N/A"
                # Ensure it starts with http
                if url != "N/A" and not url.startswith("http"):
                    url = "https://" + url

                if title == "N/A":
                    continue

                results.append({
                    "title": title,
                    "description": description,
                    "url": url,
                })
            except Exception:
                continue

        # ── Print results ─────────────────────────────────────────────────
        print(f'\nFound {len(results)} results for "{query}":\n')
        for i, r in enumerate(results, 1):
            print(f"  {i}. {r['title']}")
            print(f"     {r['description'][:100]}")
            print(f"     {r['url']}")
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
        print(f"\nTotal results found: {len(items)}")
