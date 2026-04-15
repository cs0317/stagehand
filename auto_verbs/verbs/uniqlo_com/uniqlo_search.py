"""
Auto-generated Playwright script (Python)
Uniqlo – Product Search
Query: ultra light down jacket
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
    query: str = "ultra light down jacket",
    max_results: int = 5,
) -> list:
    print(f"  Query: {query}")
    print(f"  Max results: {max_results}\n")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("uniqlo_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        # ── Navigate directly to search results ──────────────────────────
        query_encoded = query.replace(" ", "+")
        search_url = f"https://www.uniqlo.com/us/en/search?q={query_encoded}"
        print(f"Loading {search_url}...")
        page.goto(search_url, timeout=30000)
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(2000)

        # ── Dismiss modal overlay ─────────────────────────────────────────
        for selector in [
            'button[aria-label="Close"]',
            "button#onetrust-accept-btn-handler",
        ]:
            try:
                btn = page.locator(selector).first
                if btn.is_visible(timeout=2000):
                    btn.click()
                    page.wait_for_timeout(500)
                    break
            except Exception:
                pass

        # ── Wait for product cards ────────────────────────────────────────
        print("Waiting for product listings...")
        try:
            page.locator('a[class*="product"]').first.wait_for(
                state="visible", timeout=10000
            )
        except Exception:
            pass
        page.wait_for_timeout(2000)
        print(f"  Loaded: {page.url}")

        # ── Extract products ──────────────────────────────────────────────
        print(f"Extracting up to {max_results} products...")

        cards = page.locator('a[class*="product"]')
        count = cards.count()
        print(f"  Found {count} product cards on page")

        seen_names = set()
        for i in range(min(count, max_results * 3)):
            if len(results) >= max_results:
                break
            card = cards.nth(i)
            try:
                text = card.inner_text(timeout=3000)
                lines = [ln.strip() for ln in text.split("\n") if ln.strip()]

                # Line 0: gender/size info (e.g. "MEN, XL")
                # Line 1: product name
                # Line 2: price
                # Line 3 (optional): "Sale"
                # Line 4: rating
                # Line 5: review count
                name = lines[1] if len(lines) > 1 else "N/A"

                # Deduplicate by name (same product appears for MEN and WOMEN)
                name_key = name.lower()
                if name_key in seen_names:
                    continue
                seen_names.add(name_key)

                price = "N/A"
                for ln in lines:
                    m = re.search(r"\$[\d,.]+", ln)
                    if m:
                        price = m.group(0)
                        break

                # Count available colors from color chip images
                # Each non-product-name img alt that is a 2-digit number is a color code
                color_codes = card.evaluate("""e => {
                    const imgs = e.querySelectorAll('img');
                    return Array.from(imgs)
                        .map(i => i.alt)
                        .filter(a => /^\\d{2}$/.test(a));
                }""")
                num_colors = len(color_codes)
                colors_str = f"{num_colors} color{'s' if num_colors != 1 else ''}"

                if name == "N/A":
                    continue

                results.append({
                    "name": name,
                    "price": price,
                    "colors": colors_str,
                })
            except Exception:
                continue

        # ── Print results ─────────────────────────────────────────────────
        print(f'\nFound {len(results)} products for "{query}":\n')
        for i, p in enumerate(results, 1):
            print(f"  {i}. {p['name']}")
            print(f"     Price: {p['price']}  Colors: {p['colors']}")
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
