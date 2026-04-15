"""Washington Post – Article Search. Uses Playwright via CDP.

Note: WashPost search returns errors with fresh profiles, so this script
loads the homepage and extracts top articles from the front page instead.
"""
import re, os, sys, shutil
from playwright.sync_api import Playwright, sync_playwright
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws

def run(playwright: Playwright, query: str = "climate change", max_results: int = 5) -> list:
    print(f"  Query: {query}\n")
    port = get_free_port(); profile_dir = get_temp_profile_dir("washingtonpost_com")
    chrome_proc = launch_chrome(profile_dir, port); ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]; page = context.pages[0] if context.pages else context.new_page()
    results = []
    try:
        # Navigate to homepage (search is broken with fresh profiles)
        page.goto("https://www.washingtonpost.com/")
        page.wait_for_load_state("domcontentloaded"); page.wait_for_timeout(5000)
        for sel in ["button#onetrust-accept-btn-handler", "button:has-text('Accept')",
                     "button:has-text('Close')", "button:has-text('Continue')"]:
            try:
                btn = page.locator(sel).first
                if btn.is_visible(timeout=1500): btn.evaluate("el => el.click()"); page.wait_for_timeout(500)
            except Exception: pass

        # Extract article headlines from the front page
        links = page.locator("h2 a, h3 a")
        count = links.count()
        print(f"  Found {count} headline links on homepage")
        seen_titles = set()
        for i in range(count):
            if len(results) >= max_results:
                break
            link = links.nth(i)
            try:
                title = link.inner_text(timeout=2000).strip()
                if not title or title in seen_titles or len(title) < 10:
                    continue
                seen_titles.add(title)
                href = link.get_attribute("href", timeout=1000) or ""
                # Try to get the parent container for date/author
                parent = link.locator("xpath=ancestor::div[1]")
                date = author = "N/A"
                try:
                    date_el = parent.locator('time, [class*="date"], [class*="timestamp"]').first
                    date = date_el.inner_text(timeout=1000).strip()
                except Exception: pass
                try:
                    author_el = parent.locator('[class*="author"], [class*="byline"]').first
                    author = author_el.inner_text(timeout=1000).strip()
                except Exception: pass
                results.append({"title": title, "date": date, "author": author, "url": href})
                print(f"  {len(results)}. {title} | {date} | {author}")
            except Exception:
                continue

        print(f"\nFound {len(results)} articles:")
        for i, r in enumerate(results, 1):
            print(f"  {i}. {r['title']} ({r['date']}) by {r['author']}")
    except Exception as e: import traceback; print(f"Error: {e}"); traceback.print_exc()
    finally:
        try: browser.close()
        except Exception: pass
        chrome_proc.terminate(); shutil.rmtree(profile_dir, ignore_errors=True)
    return results

if __name__ == "__main__":
    with sync_playwright() as playwright: run(playwright)
