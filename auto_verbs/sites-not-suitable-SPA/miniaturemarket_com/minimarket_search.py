"""
Playwright script (Python) — Miniature Market Board Game Search
Search Miniature Market for strategy board games.
"""

import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class MiniMarketRequest:
    category: str = "strategy"
    max_results: int = 5


@dataclass
class GameItem:
    name: str = ""
    publisher: str = ""
    price: str = ""
    player_count: str = ""
    play_time: str = ""


@dataclass
class MiniMarketResult:
    games: List[GameItem] = field(default_factory=list)


# Searches Miniature Market for strategy board games and extracts
# name, publisher, price, player count, and play time.
def search_minimarket(page: Page, request: MiniMarketRequest) -> MiniMarketResult:
    url = f"https://www.miniaturemarket.com/catalogsearch/result/?q={request.category}"
    print(f"Loading {url}...")
    checkpoint("Navigate to Miniature Market search")
    page.goto(url, wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(8000)

    result = MiniMarketResult()

    checkpoint("Extract game listings")
    js_code = """(max) => {
        const results = [];
        const items = document.querySelectorAll('.product-item, [class*="product"], li[class*="item"]');
        for (const item of items) {
            if (results.length >= max) break;
            const nameEl = item.querySelector('a[class*="product-name"], .product-name, h2 a, h3 a');
            const name = nameEl ? nameEl.textContent.trim() : '';
            if (!name || name.length < 3) continue;

            const priceEl = item.querySelector('[class*="price"], .price');
            const price = priceEl ? priceEl.textContent.trim() : '';

            const text = item.textContent;
            const playerMatch = text.match(/(\\d+[-\\s]*\\d*)\\s*players?/i);
            const player_count = playerMatch ? playerMatch[0] : '';
            const timeMatch = text.match(/(\\d+[-\\s]*\\d*)\\s*min/i);
            const play_time = timeMatch ? timeMatch[0] : '';
            const publisher = '';

            results.push({ name, publisher, price, player_count, play_time });
        }
        return results;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = GameItem()
        item.name = d.get("name", "")
        item.publisher = d.get("publisher", "")
        item.price = d.get("price", "")
        item.player_count = d.get("player_count", "")
        item.play_time = d.get("play_time", "")
        result.games.append(item)

    print(f"\nFound {len(result.games)} games:")
    for i, g in enumerate(result.games, 1):
        print(f"\n  {i}. {g.name}")
        print(f"     Price: {g.price}  Players: {g.player_count}  Time: {g.play_time}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("minimarket")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            result = search_minimarket(page, MiniMarketRequest())
            print("\n=== DONE ===")
            print(f"Found {len(result.games)} games")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
