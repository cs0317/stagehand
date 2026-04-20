"""
Playwright script (Python) — Giant Bomb Game Search
Search for game information on giantbomb.com.
"""

import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class GiantBombSearchRequest:
    search_query: str = "Elden Ring"


@dataclass
class GameInfo:
    title: str = ""
    platforms: str = ""
    release_date: str = ""
    developer: str = ""
    publisher: str = ""
    genre: str = ""
    rating: str = ""
    link: str = ""


@dataclass
class GiantBombSearchResult:
    query: str = ""
    items: List[GameInfo] = field(default_factory=list)


# Searches Giant Bomb for game information and returns results
# including title, platforms, release date, developer, publisher, genre, and rating.
def search_giantbomb(page: Page, request: GiantBombSearchRequest) -> GiantBombSearchResult:
    import urllib.parse
    url = f"https://www.giantbomb.com/search/?i=&q={urllib.parse.quote_plus(request.search_query)}"
    print(f"Loading {url}...")
    checkpoint("Navigate to search results")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    result = GiantBombSearchResult(query=request.search_query)

    checkpoint("Extract game info")
    js_code = """() => {
        const results = [];
        const cards = document.querySelectorAll('.search-result, [class*="search-results"] li, article, [class*="result"]');
        for (const card of cards) {
            if (results.length >= 5) break;
            const titleEl = card.querySelector('a h3, h3 a, h2 a, a[class*="title"], h3, h2');
            const title = titleEl ? titleEl.textContent.trim() : '';
            if (!title || title.length < 3) continue;
            if (results.some(r => r.title === title)) continue;

            const text = (card.textContent || '').replace(/\\s+/g, ' ').trim();

            let platforms = '';
            const platMatch = text.match(/(?:platforms?|available on)[:\\s]*([\\w\\s,\\/]+)/i);
            if (platMatch) platforms = platMatch[1].trim();

            let releaseDate = '';
            const dateMatch = text.match(/(?:release[d]?\\s*(?:date)?|launch)[:\\s]*(\\w+\\s+\\d{1,2},?\\s+\\d{4}|\\d{4}-\\d{2}-\\d{2})/i);
            if (dateMatch) releaseDate = dateMatch[1];

            let developer = '';
            const devMatch = text.match(/(?:developer|developed by)[:\\s]*([\\w\\s]+?)(?:\\s*publisher|\\s*genre|\\s*$)/i);
            if (devMatch) developer = devMatch[1].trim();

            let publisher = '';
            const pubMatch = text.match(/(?:publisher|published by)[:\\s]*([\\w\\s]+?)(?:\\s*genre|\\s*$)/i);
            if (pubMatch) publisher = pubMatch[1].trim();

            let genre = '';
            const genMatch = text.match(/(?:genre|type)[:\\s]*([\\w\\s,\\/]+?)(?:\\s*rating|\\s*$)/i);
            if (genMatch) genre = genMatch[1].trim();

            let rating = '';
            const rateMatch = text.match(/(?:rating|score)[:\\s]*([\\d.]+(?:\\s*\\/\\s*[\\d.]+)?)/i);
            if (rateMatch) rating = rateMatch[1];

            const linkEl = card.querySelector('a[href]');
            const link = linkEl ? linkEl.href : '';

            results.push({ title, platforms, release_date: releaseDate, developer, publisher, genre, rating, link });
        }
        return results;
    }"""
    items_data = page.evaluate(js_code)

    for d in items_data:
        item = GameInfo()
        item.title = d.get("title", "")
        item.platforms = d.get("platforms", "")
        item.release_date = d.get("release_date", "")
        item.developer = d.get("developer", "")
        item.publisher = d.get("publisher", "")
        item.genre = d.get("genre", "")
        item.rating = d.get("rating", "")
        item.link = d.get("link", "")
        result.items.append(item)

    print(f"\nFound {len(result.items)} results for '{request.search_query}':")
    for i, item in enumerate(result.items, 1):
        print(f"\n  {i}. {item.title}")
        print(f"     Platforms: {item.platforms}  Released: {item.release_date}")
        print(f"     Developer: {item.developer}  Publisher: {item.publisher}")
        print(f"     Genre: {item.genre}  Rating: {item.rating}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("giantbomb")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            result = search_giantbomb(page, GiantBombSearchRequest())
            print("\n=== DONE ===")
            print(f"Found {len(result.items)} results")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
