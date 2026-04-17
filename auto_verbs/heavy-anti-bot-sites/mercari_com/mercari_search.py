import re
import os
from dataclasses import dataclass
from urllib.parse import quote_plus
from playwright.sync_api import sync_playwright, Page

import sys as _sys
import os as _os
_sys.path.insert(0, _os.path.join(_os.path.dirname(__file__), ".."))
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class MercariSearchRequest:
    query: str = "Nintendo Switch"
    max_results: int = 5


@dataclass(frozen=True)
class MercariListing:
    item_title: str = ""
    price: str = ""
    condition: str = ""
    seller_name: str = ""


@dataclass(frozen=True)
class MercariSearchResult:
    listings: list = None  # list[MercariListing]


# Search for secondhand items on Mercari matching a query and extract
# item title, price, condition, and seller name.
def mercari_search(page: Page, request: MercariSearchRequest) -> MercariSearchResult:
    query = request.query
    max_results = request.max_results
    print(f"  Search query: {query}")
    print(f"  Max results: {max_results}\n")

    url = f"https://www.mercari.com/search/?keyword={quote_plus(query)}"
    print(f"Loading {url}...")
    checkpoint(f"Navigate to Mercari search")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(8000)
    print(f"  Loaded: {page.url}")

    body_text = page.evaluate("document.body ? document.body.innerText : ''") or ""

    results = []

    # Try structured extraction via item card elements
    cards = page.locator(
        '[data-testid="ItemCell"], '
        '[class*="ItemCell"], '
        '[class*="SearchItem"], '
        '[class*="item-cell"], '
        'a[href*="/item/"]'
    )
    count = cards.count()
    print(f"  Found {count} item cards via selectors")

    if count > 0:
        for i in range(min(count, max_results)):
            card = cards.nth(i)
            try:
                card_text = card.inner_text(timeout=3000).strip()
                lines = [l.strip() for l in card_text.split("\n") if l.strip()]

                item_title = "N/A"
                price = "N/A"
                condition = "N/A"
                seller_name = "N/A"

                condition_keywords = [
                    "new", "like new", "good", "fair", "poor",
                    "brand new", "sealed", "used", "excellent",
                ]

                for line in lines:
                    # Price pattern (e.g. "$25.00", "$1,200")
                    pm = re.match(r'^(\$[\d,.]+)$', line)
                    if pm and price == "N/A":
                        price = pm.group(1)
                        continue
                    # Condition keywords
                    if any(kw in line.lower() for kw in condition_keywords) and condition == "N/A" and len(line) < 40:
                        condition = line
                        continue
                    # Title — longest descriptive line
                    if len(line) > 3 and not re.match(r'^[\d,$%.]+$', line):
                        if item_title == "N/A" or len(line) > len(item_title):
                            if seller_name == "N/A" and item_title != "N/A":
                                seller_name = item_title
                            item_title = line

                if item_title != "N/A":
                    results.append(MercariListing(
                        item_title=item_title,
                        price=price,
                        condition=condition,
                        seller_name=seller_name,
                    ))
            except Exception:
                continue

    # Fallback: text-based extraction
    if not results:
        print("  Card selectors missed, trying text-based extraction...")
        text_lines = [l.strip() for l in body_text.split("\n") if l.strip()]

        condition_keywords = [
            "new", "like new", "good", "fair", "poor",
            "brand new", "sealed", "used", "excellent",
        ]

        i = 0
        while i < len(text_lines) and len(results) < max_results:
            line = text_lines[i]
            # Look for lines that could be item titles (longer descriptive text)
            if len(line) > 10 and not re.match(r'^[\d,$%.]+$', line):
                item_title = line
                price = "N/A"
                condition = "N/A"
                seller_name = "N/A"

                # Check nearby lines for price, condition, seller
                for j in range(i + 1, min(len(text_lines), i + 6)):
                    nearby = text_lines[j]
                    # Price
                    pm = re.match(r'^(\$[\d,.]+)$', nearby)
                    if pm and price == "N/A":
                        price = pm.group(1)
                        continue
                    # Condition
                    if any(kw in nearby.lower() for kw in condition_keywords) and condition == "N/A" and len(nearby) < 40:
                        condition = nearby
                        continue
                    # Short non-numeric line could be seller
                    if (len(nearby) > 2 and len(nearby) < 50
                            and not re.match(r'^[\d,$%.]+$', nearby)
                            and seller_name == "N/A"):
                        seller_name = nearby

                if item_title != "N/A":
                    results.append(MercariListing(
                        item_title=item_title,
                        price=price,
                        condition=condition,
                        seller_name=seller_name,
                    ))
                    i += 5
                    continue
            i += 1

        results = results[:max_results]

    print("=" * 60)
    print(f"Mercari - Search Results for \"{query}\"")
    print("=" * 60)
    for idx, listing in enumerate(results, 1):
        print(f"\n{idx}. {listing.item_title}")
        print(f"   Price: {listing.price}")
        print(f"   Condition: {listing.condition}")
        print(f"   Seller: {listing.seller_name}")

    print(f"\nFound {len(results)} listings")

    return MercariSearchResult(listings=results)


def test_func():
    import subprocess, time
    subprocess.call("taskkill /f /im chrome.exe", stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(2)
    chrome_user_data = os.path.join(
        os.environ["USERPROFILE"], "AppData", "Local", "Google", "Chrome", "User Data", "Default"
    )
    with sync_playwright() as pw:
        context = pw.chromium.launch_persistent_context(
            chrome_user_data,
            channel="chrome",
            headless=False,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--disable-infobars",
                "--disable-extensions",
            ],
        )
        page = context.pages[0] if context.pages else context.new_page()
        result = mercari_search(page, MercariSearchRequest())
        print(f"\nReturned {len(result.listings or [])} listings")
        context.close()


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
