"""
Playwright script (Python) — GameFAQs Guide Search
Search for game guides on GameFAQs.
"""

import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class GameFAQsSearchRequest:
    search_query: str = "The Legend of Zelda Tears of the Kingdom"
    max_results: int = 5


@dataclass
class GuideItem:
    title: str = ""
    author: str = ""
    guide_type: str = ""
    rating: str = ""


@dataclass
class GameFAQsSearchResult:
    query: str = ""
    items: List[GuideItem] = field(default_factory=list)


# Searches GameFAQs for guides/walkthroughs for the given game and returns
# up to max_results guides with title, author, guide type, and rating.
def search_gamefaqs_guides(page: Page, request: GameFAQsSearchRequest) -> GameFAQsSearchResult:
    import urllib.parse
    url = f"https://gamefaqs.gamespot.com/search?game={urllib.parse.quote_plus(request.search_query)}"
    print(f"Loading {url}...")
    checkpoint("Navigate to search results")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    result = GameFAQsSearchResult(query=request.search_query)

    # Try to click first game result to get to FAQs page
    try:
        game_link = page.locator('a[class*="result"], .search_result a, td a').first
        checkpoint("Click first game result")
        game_link.click(timeout=5000)
        page.wait_for_timeout(3000)
        current_url = page.url
        if '/faqs' not in current_url:
            page.goto(current_url.rstrip('/') + '/faqs', wait_until="domcontentloaded")
            page.wait_for_timeout(3000)
    except Exception as e:
        print(f"Could not navigate to game FAQs page: {e}")

    checkpoint("Extract guide listings")
    js_code = """(max) => {
        const results = [];
        const rows = document.querySelectorAll('tr, [class*="faq"], [class*="guide"], article, li[class*="item"]');
        for (const row of rows) {
            if (results.length >= max) break;
            const titleEl = row.querySelector('a, [class*="title"], h3, h2');
            const title = titleEl ? titleEl.textContent.trim() : '';
            if (!title || title.length < 5) continue;
            if (results.some(r => r.title === title)) continue;

            const text = (row.textContent || '').replace(/\\s+/g, ' ').trim();

            let author = '';
            const cells = row.querySelectorAll('td');
            if (cells.length >= 2) author = cells[1]?.textContent?.trim() || '';
            if (!author) {
                const authEl = row.querySelector('[class*="author"], [class*="user"]');
                if (authEl) author = authEl.textContent.trim();
            }

            let guideType = '';
            const typeMatch = text.match(/(walkthrough|faq|guide|cheat|map|review|hint|tip)/i);
            if (typeMatch) guideType = typeMatch[0];

            let rating = '';
            const ratingMatch = text.match(/(\\d+\\.?\\d*)\\s*(?:\\/\\s*\\d+|%|star)/i);
            if (ratingMatch) rating = ratingMatch[0];

            results.push({ title, author, guide_type: guideType, rating });
        }
        return results;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = GuideItem()
        item.title = d.get("title", "")
        item.author = d.get("author", "")
        item.guide_type = d.get("guide_type", "")
        item.rating = d.get("rating", "")
        result.items.append(item)

    print(f"\nFound {len(result.items)} guides for '{request.search_query}':")
    for i, item in enumerate(result.items, 1):
        print(f"\n  {i}. {item.title}")
        print(f"     Author: {item.author}  Type: {item.guide_type}  Rating: {item.rating}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("gamefaqs")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            result = search_gamefaqs_guides(page, GameFAQsSearchRequest())
            print("\n=== DONE ===")
            print(f"Found {len(result.items)} guides")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
