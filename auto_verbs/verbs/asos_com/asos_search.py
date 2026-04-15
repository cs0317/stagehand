"""
Auto-generated Playwright script (Python)
ASOS.com – Product Search
Query: men's jackets
Max results: 5

Generated on: 2026-04-15T19:36:25.925Z
Recorded 2 browser interactions

Uses Playwright with CDP connection to a real Chrome instance.
"""

import re
import os, sys, shutil
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws


def run(
    playwright: Playwright,
    query: str = "men's jackets",
    max_results: int = 5,
) -> list:
    print(f"  Query: {query}")
    print(f"  Max results: {max_results}\n")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("asos_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        # ── Navigate directly to search results ──────────────────────────
        search_query = query.replace(" ", "+")
        search_url = f"https://www.asos.com/search/?q={search_query}"
        print(f"Loading {search_url}...")
        page.goto(search_url)
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(5000)
        print(f"  Loaded: {page.url}")

        # ── Extract products ──────────────────────────────────────────────
        print(f"Extracting up to {max_results} products...")

        # ASOS product cards are li[id^="product-"] elements
        # Each contains an <a> with aria-label="Product Name, Price £XX.XX"
        product_cards = page.locator("li[id^='product-']")
        count = product_cards.count()
        print(f"  Found {count} product cards on page")

        for i in range(min(count, max_results)):
            card = product_cards.nth(i)
            try:
                # The product link has aria-label with name and price
                link = card.locator("a[href*='/prd/']").first
                aria_label = link.get_attribute("aria-label", timeout=3000)
                href = link.get_attribute("href", timeout=3000) or ""

                name = "N/A"
                price = "N/A"
                brand = "N/A"

                if aria_label:
                    # aria-label format: "Product Name, Price £XX.XX"
                    m = re.match(r"^(.+?),\s*Price\s+(.+)$", aria_label)
                    if m:
                        name = m.group(1).strip()
                        price = m.group(2).strip()

                # Extract brand from URL path: /brand-name/product-slug/prd/...
                if href:
                    brand_match = re.search(r"asos\.com/([^/]+)/", href)
                    if brand_match:
                        brand = brand_match.group(1).replace("-", " ").title()

                if name == "N/A":
                    continue

                results.append({
                    "name": name,
                    "price": price,
                    "brand": brand,
                })
            except Exception:
                continue

        # ── Print results ─────────────────────────────────────────────────
        print(f"\nFound {len(results)} products for '{query}':\n")
        for i, product in enumerate(results, 1):
            print(f"  {i}. {product['name']}")
            print(f"     Brand: {product['brand']}")
            print(f"     Price: {product['price']}")
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
        print(f"\nTotal products found: {len(items)}")
