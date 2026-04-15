"""REI – Product Search. Uses Playwright via CDP."""
import re, os, sys, shutil
from playwright.sync_api import Playwright, sync_playwright
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws

def run(playwright: Playwright, query: str = "hiking backpack", max_results: int = 5) -> list:
    print(f"  Query: {query}\n")
    port = get_free_port(); profile_dir = get_temp_profile_dir("rei_com")
    chrome_proc = launch_chrome(profile_dir, port); ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]; page = context.pages[0] if context.pages else context.new_page()
    results = []
    try:
        page.goto("https://www.rei.com"); page.wait_for_load_state("domcontentloaded"); page.wait_for_timeout(2000)
        for sel in ["button#onetrust-accept-btn-handler", "button:has-text('Accept')", "button:has-text('Close')"]:
            try:
                btn = page.locator(sel).first
                if btn.is_visible(timeout=1500): btn.evaluate("el => el.click()"); page.wait_for_timeout(500)
            except Exception: pass
        si = page.locator('input[id="search-input"], input[name="q"], input[aria-label*="search" i], input[type="search"]').first
        si.evaluate("el => el.click()"); page.wait_for_timeout(500)
        page.keyboard.press("Control+a"); si.type(query, delay=50); page.wait_for_timeout(1000); page.keyboard.press("Enter")
        page.wait_for_timeout(2000); page.wait_for_load_state("domcontentloaded"); page.wait_for_timeout(2000)
        cards = page.locator('[data-ui="product-card"], div[class*="product-card"], li[class*="product"]')
        count = cards.count()
        for i in range(min(count, max_results)):
            card = cards.nth(i); name = price = rating = "N/A"
            try: name = card.locator('[class*="product-name"], a[class*="title"], h3').first.inner_text(timeout=2000).strip()
            except Exception: pass
            try: price = card.locator('[class*="price"], span:has-text("$")').first.inner_text(timeout=2000).strip()
            except Exception: pass
            try: rating = card.locator('[class*="rating"], [aria-label*="star"], [title*="out of"]').first.get_attribute("aria-label", timeout=2000) or "N/A"
            except Exception: pass
            if name != "N/A": results.append({"name": name, "price": price, "rating": rating}); print(f"  {len(results)}. {name} | {price} | {rating}")
        print(f"\nFound {len(results)} products:")
        for i, r in enumerate(results, 1): print(f"  {i}. {r['name']} — {r['price']} ({r['rating']})")
    except Exception as e: import traceback; print(f"Error: {e}"); traceback.print_exc()
    finally:
        try: browser.close()
        except Exception: pass
        chrome_proc.terminate(); shutil.rmtree(profile_dir, ignore_errors=True)
    return results

if __name__ == "__main__":
    with sync_playwright() as playwright: run(playwright)
