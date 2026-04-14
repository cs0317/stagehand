"""
Allrecipes.com – Recipe Search
Search for recipes matching a query, extract name, rating, and cook time.

Uses Playwright via CDP connection with the user's Chrome profile.
"""

import re
import os, sys, shutil
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws


def run(
    playwright: Playwright,
    query: str = "chicken parmesan",
    max_results: int = 5,
) -> list:
    print(f"  Query: {query}")
    print(f"  Max results: {max_results}\n")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("allrecipes_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        # ── Navigate ──────────────────────────────────────────────────────
        print("Loading Allrecipes.com...")
        page.goto("https://www.allrecipes.com")
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(2000)

        # ── Dismiss popups / cookie banners ───────────────────────────────
        for selector in [
            "button#onetrust-accept-btn-handler",
            "button:has-text('Accept')",
            "button:has-text('Got it')",
            "button:has-text('Close')",
        ]:
            try:
                btn = page.locator(selector).first
                if btn.is_visible(timeout=1500):
                    btn.evaluate("el => el.click()")
                    page.wait_for_timeout(500)
            except Exception:
                pass

        # ── STEP 1: Search ────────────────────────────────────────────────
        print(f'STEP 1: Search for "{query}"...')
        search_input = page.locator(
            'input#search-input, '
            'input[name="search"], '
            'input[aria-label*="search" i], '
            'input[placeholder*="search" i]'
        ).first
        search_input.evaluate("el => el.click()")
        page.wait_for_timeout(500)
        page.keyboard.press("Control+a")
        search_input.type(query, delay=50)
        page.wait_for_timeout(1000)
        page.keyboard.press("Enter")
        print(f'  Typed "{query}" and pressed Enter')
        page.wait_for_timeout(2000)
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(2000)

        # ── STEP 2: Extract recipes ───────────────────────────────────────
        print(f"STEP 2: Extract up to {max_results} recipes...")

        recipe_cards = page.locator(
            'a[data-doc-id]'
        )
        count = recipe_cards.count()
        print(f"  Found {count} recipe cards")

        for i in range(count):
            if len(results) >= max_results:
                break
            card = recipe_cards.nth(i)
            try:
                name = "N/A"
                rating = "N/A"
                cook_time = "N/A"

                # Recipe name
                try:
                    name_el = card.locator(
                        'span.card__title-text, '
                        'span[class*="title"], '
                        'h3, h4'
                    ).first
                    name = name_el.inner_text(timeout=2000).strip()
                except Exception:
                    try:
                        name = card.get_attribute("aria-label") or "N/A"
                    except Exception:
                        pass

                if name == "N/A":
                    continue

                # Click into recipe page to get rating and cook time
                card.evaluate("el => el.click()")
                page.wait_for_timeout(2000)

                # Rating
                try:
                    rating_el = page.locator(
                        '#mm-recipes-review-bar__rating_1-0, '
                        '.mm-recipes-review-bar__rating'
                    ).first
                    rating_text = rating_el.inner_text(timeout=2000).strip()
                    rm = re.search(r"[\d.]+", rating_text)
                    if rm:
                        rating = rm.group(0)
                except Exception:
                    pass

                # Cook time — find the detail row containing "Total Time"
                try:
                    detail_items = page.locator('[class*="detail"]:has-text("Total Time")')
                    for j in range(detail_items.count()):
                        txt = detail_items.nth(j).inner_text(timeout=2000).strip()
                        tm = re.search(
                            r"Total Time[:\s]*(\d+\s*(?:hrs?|mins?|hours?|minutes?)[\s\d]*)",
                            txt, re.IGNORECASE,
                        )
                        if tm:
                            cook_time = tm.group(1).strip()
                            break
                except Exception:
                    pass

                results.append({
                    "name": name,
                    "rating": rating,
                    "cook_time": cook_time,
                })
                print(f"  {len(results)}. {name} | Rating: {rating} | Time: {cook_time}")

                # Go back to search results
                page.go_back()
                page.wait_for_timeout(2000)

            except Exception as e:
                print(f"  Error on card {i}: {e}")
                try:
                    page.go_back()
                    page.wait_for_timeout(2000)
                except Exception:
                    pass
                continue

        # ── Print results ─────────────────────────────────────────────────
        print(f"\nFound {len(results)} recipes for '{query}':")
        for i, r in enumerate(results, 1):
            print(f"  {i}. {r['name']}")
            print(f"     Rating: {r['rating']}  Cook Time: {r['cook_time']}")

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
        print(f"\nTotal recipes found: {len(items)}")
