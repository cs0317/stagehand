import os
import sys
import shutil
from dataclasses import dataclass, field
from typing import List

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class LegoSearchRequest:
    search_query: str = "star wars"
    max_results: int = 5


@dataclass
class LegoSearchItem:
    set_name: str = ""
    set_number: str = ""
    price: str = ""
    age_range: str = ""
    piece_count: str = ""
    theme: str = ""
    rating: str = ""
    availability: str = ""


@dataclass
class LegoSearchResult:
    items: List[LegoSearchItem] = field(default_factory=list)
    query: str = ""
    result_count: int = 0


def lego_search(page, request: LegoSearchRequest) -> LegoSearchResult:
    url = f"https://www.lego.com/en-us/search?q={request.search_query.replace(' ', '+')}"
    page.goto(url, wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(5000)

    raw_items = page.evaluate("""() => {
        const items = [];
        const cards = document.querySelectorAll('[data-test="product-leaf"], [class*="ProductLeaf"], article[class*="product"], li[class*="product"], div[class*="ProductCard"]');
        for (const card of cards) {
            const nameEl = card.querySelector('[data-test="product-leaf-title"], h2, h3, [class*="ProductTitle"], [class*="product-title"], a[class*="title"]');
            const priceEl = card.querySelector('[data-test="product-leaf-price"], [class*="Price"], [class*="price"], span[class*="sale"]');
            const ageEl = card.querySelector('[class*="ages"], [class*="Age"], [data-test*="age"]');
            const piecesEl = card.querySelector('[class*="pieces"], [class*="Piece"]');
            const ratingEl = card.querySelector('[class*="rating"], [class*="Rating"], [data-test*="rating"]');
            const availEl = card.querySelector('[class*="availability"], [class*="Availability"], [class*="stock"]');
            const linkEl = card.querySelector('a[href]');
            const badgeEl = card.querySelector('[class*="badge"], [class*="Badge"], [class*="theme"]');

            const name = nameEl ? nameEl.textContent.trim() : '';
            if (!name) continue;

            // Try to extract set number from link or text
            let setNumber = '';
            if (linkEl) {
                const href = linkEl.href || '';
                const match = href.match(/(\\d{5,6})/);
                if (match) setNumber = match[1];
            }

            items.push({
                set_name: name,
                set_number: setNumber,
                price: priceEl ? priceEl.textContent.trim() : '',
                age_range: ageEl ? ageEl.textContent.trim() : '',
                piece_count: piecesEl ? piecesEl.textContent.trim() : '',
                theme: badgeEl ? badgeEl.textContent.trim() : '',
                rating: ratingEl ? ratingEl.textContent.trim() : '',
                availability: availEl ? availEl.textContent.trim() : 'Available',
            });
        }
        return items;
    }""")

    checkpoint(page, "Extracted LEGO search results")

    result = LegoSearchResult(query=request.search_query)
    for raw in raw_items[: request.max_results]:
        item = LegoSearchItem(
            set_name=raw.get("set_name", ""),
            set_number=raw.get("set_number", ""),
            price=raw.get("price", ""),
            age_range=raw.get("age_range", ""),
            piece_count=raw.get("piece_count", ""),
            theme=raw.get("theme", ""),
            rating=raw.get("rating", ""),
            availability=raw.get("availability", ""),
        )
        result.items.append(item)

    result.result_count = len(result.items)
    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir()
    chrome_proc = launch_chrome(port, profile_dir)
    ws_url = wait_for_cdp_ws(port)

    from playwright.sync_api import sync_playwright
    pw = sync_playwright().start()
    browser = pw.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()

    try:
        request = LegoSearchRequest(search_query="star wars", max_results=5)
        result = lego_search(page, request)
        print(f"Query: {result.query}")
        print(f"Result count: {result.result_count}")
        for i, item in enumerate(result.items, 1):
            print(f"\n--- Result {i} ---")
            print(f"  Set Name: {item.set_name}")
            print(f"  Set Number: {item.set_number}")
            print(f"  Price: {item.price}")
            print(f"  Age Range: {item.age_range}")
            print(f"  Piece Count: {item.piece_count}")
            print(f"  Theme: {item.theme}")
            print(f"  Rating: {item.rating}")
            print(f"  Availability: {item.availability}")
    finally:
        browser.close()
        pw.stop()
        chrome_proc.terminate()
        shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
