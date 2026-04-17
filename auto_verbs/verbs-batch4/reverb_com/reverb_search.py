import os
from dataclasses import dataclass
from playwright.sync_api import sync_playwright, Page

import sys as _sys
import os as _os
_sys.path.insert(0, _os.path.join(_os.path.dirname(__file__), ".."))
from playwright_debugger import checkpoint

@dataclass(frozen=True)
class ReverbSearchRequest:
    search_term: str = "Fender Stratocaster"
    max_results: int = 5

@dataclass(frozen=True)
class ReverbListing:
    item_title: str = ""
    condition: str = ""
    price: str = ""
    url: str = ""
    image_url: str = ""

@dataclass(frozen=True)
class ReverbSearchResult:
    listings: list = None  # list[ReverbListing]

# Search Reverb.com for musical instruments matching a search term
# and extract item title, condition, price, URL, and image URL.
def reverb_search(page: Page, request: ReverbSearchRequest) -> ReverbSearchResult:
    search_term = request.search_term
    max_results = request.max_results
    print(f"  Search term: {search_term}")
    print(f"  Max results: {max_results}\n")

    search_url = f"https://reverb.com/marketplace?query={search_term.replace(' ', '+')}"
    print(f"Loading {search_url}...")
    checkpoint("Navigate to Reverb marketplace search")
    page.goto(search_url, wait_until="domcontentloaded")

    # Reverb SPA does client-side rendering — poll until item links appear
    stable_count = 0
    for attempt in range(30):
        try:
            link_count = page.evaluate("document.querySelectorAll(\"a[href*='/item/']\").length")
            if link_count > 0:
                stable_count += 1
                if stable_count >= 3:
                    print(f"  Content stable after {attempt + 1} polls ({link_count} links)")
                    break
            else:
                stable_count = 0
        except Exception:
            stable_count = 0
        page.wait_for_timeout(1000)

    # Wait for any auto-redirect to settle (Reverb may append filters to URL)
    page.wait_for_timeout(5000)
    # Reverb often auto-navigates to add filters; wait for URL to stabilize
    prev_url = page.url
    for _ in range(6):
        page.wait_for_timeout(2000)
        if page.url == prev_url:
            break
        prev_url = page.url
    print(f"  Loaded: {page.url}")

    # Dismiss cookie banner
    for selector in [
        'button:has-text("Accept")',
        'button:has-text("Accept All")',
        'button:has-text("Got It")',
        '#onetrust-accept-btn-handler',
    ]:
        try:
            btn = page.locator(selector).first
            if btn.is_visible(timeout=1000):
                checkpoint(f"Dismiss cookie banner: {selector}")
                btn.click()
                page.wait_for_timeout(500)
                break
        except Exception:
            pass

    results = []

    # Use locator-based extraction (resilient to SPA context destruction)
    checkpoint("Extract listing data from search results")
    for _retry in range(3):
        try:
            # Try item links which are reliably present
            item_links = page.locator('a[href*="/item/"]')
            link_count = item_links.count()
            print(f"  Found {link_count} item links (attempt {_retry + 1})")

            seen_titles = set()
            for i in range(link_count):
                if len(results) >= max_results:
                    break
                link = item_links.nth(i)
                try:
                    text = link.inner_text(timeout=2000).strip()
                    href = link.get_attribute("href") or ""
                    if not text or len(text) < 5 or text in seen_titles:
                        continue
                    # Skip navigation/filter links
                    if any(kw in text.lower() for kw in ["filter", "sort", "view all", "see all", "log in"]):
                        continue
                    seen_titles.add(text)
                    lines = [l.strip() for l in text.split("\n") if l.strip()]
                    title = lines[0] if lines else text
                    condition = "N/A"
                    price = "N/A"
                    for line in lines[1:]:
                        if re.match(r'^\$[\d,.]+', line):
                            price = line
                        elif re.match(r'^(Mint|Excellent|Very Good|Good|Fair|Poor|Brand New|Used)', line, re.I):
                            condition = line
                    url = f"https://reverb.com{href}" if href.startswith("/") else href
                    results.append(ReverbListing(
                        item_title=title,
                        condition=condition,
                        price=price,
                        url=url,
                        image_url="N/A",
                    ))
                except Exception:
                    continue
            break
        except Exception as e:
            if _retry < 2:
                print(f"  Extraction failed ({e}), retrying after wait...")
                page.wait_for_timeout(5000)
            else:
                print(f"  All retries failed: {e}")

    print("=" * 60)
    print(f"Reverb - Search Results for \"{search_term}\"")
    print("=" * 60)
    for idx, l in enumerate(results, 1):
        print(f"\n{idx}. {l.item_title}")
        print(f"   Condition: {l.condition}")
        print(f"   Price: {l.price}")
        print(f"   URL: {l.url}")

    print(f"\nFound {len(results)} listings")

    return ReverbSearchResult(listings=results)

def test_func():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(
            channel="chrome",
            headless=False,
            args=["--disable-blink-features=AutomationControlled"],
        )
        page = browser.new_page()
        result = reverb_search(page, ReverbSearchRequest())
        print(f"\nReturned {len(result.listings or [])} listings")
        browser.close()

if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
