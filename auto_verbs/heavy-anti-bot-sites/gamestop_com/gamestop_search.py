"""
Playwright script (Python) — GameStop Game Search
Search for games on GameStop.com.
"""

import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class GameStopSearchRequest:
    search_query: str = "PlayStation 5"
    max_results: int = 5


@dataclass
class GameItem:
    title: str = ""
    platform: str = ""
    price: str = ""
    condition: str = ""
    rating: str = ""


@dataclass
class GameStopSearchResult:
    query: str = ""
    items: List[GameItem] = field(default_factory=list)


# Searches GameStop.com for games matching the query and returns
# up to max_results games with title, platform, price, condition, and rating.
def search_gamestop(page: Page, request: GameStopSearchRequest) -> GameStopSearchResult:
    import urllib.parse
    url = f"https://www.gamestop.com/search/?q={urllib.parse.quote_plus(request.search_query)}&lang=default"
    print(f"Loading {url}...")
    checkpoint("Navigate to search results")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    result = GameStopSearchResult(query=request.search_query)

    checkpoint("Extract game listings")
    js_code = """(max) => {
        const results = [];
        const cards = document.querySelectorAll('[class*="product-card"], [class*="product-tile"], article, [data-testid*="product"]');
        for (const card of cards) {
            if (results.length >= max) break;
            const titleEl = card.querySelector('h2, h3, a[class*="title"], [class*="product-name"], [class*="title"]');
            const title = titleEl ? titleEl.textContent.trim() : '';
            if (!title || title.length < 5) continue;
            if (results.some(r => r.title === title)) continue;

            const text = (card.textContent || '').replace(/\\s+/g, ' ').trim();

            let platform = '';
            const platMatch = text.match(/(PlayStation\\s*[45]|PS[45]|Xbox|Nintendo\\s*Switch|PC)/i);
            if (platMatch) platform = platMatch[0];

            let price = '';
            const priceEl = card.querySelector('[class*="price"]');
            if (priceEl) price = priceEl.textContent.trim();

            let condition = '';
            const condMatch = text.match(/(new|pre-owned|used|refurbished|digital)/i);
            if (condMatch) condition = condMatch[0];

            let rating = '';
            const ratingMatch = text.match(/(\\d\\.?\\d*)\\s*(?:out of|\\/\\s*5|star)/i);
            if (ratingMatch) rating = ratingMatch[1];

            results.push({ title, platform, price, condition, rating });
        }
        return results;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = GameItem()
        item.title = d.get("title", "")
        item.platform = d.get("platform", "")
        item.price = d.get("price", "")
        item.condition = d.get("condition", "")
        item.rating = d.get("rating", "")
        result.items.append(item)

    print(f"\nFound {len(result.items)} games for '{request.search_query}':")
    for i, item in enumerate(result.items, 1):
        print(f"\n  {i}. {item.title}")
        print(f"     Platform: {item.platform}  Price: {item.price}")
        print(f"     Condition: {item.condition}  Rating: {item.rating}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("gamestop")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            result = search_gamestop(page, GameStopSearchRequest())
            print("\n=== DONE ===")
            print(f"Found {len(result.items)} games")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
