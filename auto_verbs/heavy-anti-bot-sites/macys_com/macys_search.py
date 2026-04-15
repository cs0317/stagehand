"""Macy's – Product Search. Uses Playwright via CDP."""
import re, os, sys, shutil
from playwright.sync_api import Playwright, sync_playwright
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws

def run(playwright: Playwright, query: str = "women's handbags", max_results: int = 5) -> list:
    print(f"  Query: {query}\n")
    port = get_free_port(); profile_dir = get_temp_profile_dir("macys_com")
    chrome_proc = launch_chrome(profile_dir, port); ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]; page = context.pages[0] if context.pages else context.new_page()
    results = []
    try:
        page.goto("https://www.macys.com"); page.wait_for_load_state("domcontentloaded"); page.wait_for_timeout(2000)
        for sel in ["button#onetrust-accept-btn-handler", "button:has-text('Accept')", "button:has-text('Close')"]:
            try:
                btn = page.locator(sel).first
                if btn.is_visible(timeout=1500): btn.evaluate("el => el.click()"); page.wait_for_timeout(500)
            except Exception: pass
        si = page.locator('input[id="globalSearchInputField"], input[name="keyword"], input[aria-label*="search" i], input[type="search"]').first
        si.evaluate("el => el.click()"); page.wait_for_timeout(500)
        page.keyboard.press("Control+a"); si.type(query, delay=50); page.wait_for_timeout(1000); page.keyboard.press("Enter")
        page.wait_for_timeout(2000); page.wait_for_load_state("domcontentloaded"); page.wait_for_timeout(2000)
        cards = page.locator('[data-testid="productCard"], div[class*="product-card"], li[class*="cell"]')
        count = cards.count()
        for i in range(min(count, max_results)):
            card = cards.nth(i); name = brand = price = "N/A"
            try: name = card.locator('[class*="product-name"], [data-testid="productDescription"], a[class*="name"]').first.inner_text(timeout=2000).strip()
            except Exception: pass
            try: brand = card.locator('[class*="brand"], [data-testid="productBrand"]').first.inner_text(timeout=2000).strip()
            except Exception: pass
            try: price = card.locator('[class*="price"], [data-testid*="price"], span:has-text("$")').first.inner_text(timeout=2000).strip()
            except Exception: pass
            if name != "N/A": results.append({"name": name, "brand": brand, "price": price}); print(f"  {len(results)}. {name} | {brand} | {price}")
        print(f"\nFound {len(results)} products:")
        for i, r in enumerate(results, 1): print(f"  {i}. {r['name']} — {r['brand']} ({r['price']})")
    except Exception as e: import traceback; print(f"Error: {e}"); traceback.print_exc()
    finally:
        try: browser.close()
        except Exception: pass
        chrome_proc.terminate(); shutil.rmtree(profile_dir, ignore_errors=True)
    return results

if __name__ == "__main__":
    with sync_playwright() as playwright: run(playwright)
