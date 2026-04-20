"""
Playwright script (Python) — Barron's Search
Search for articles on Barron's.
"""

import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from urllib.parse import quote_plus
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class BarronsSearchRequest:
    query: str = "technology stocks"
    max_results: int = 5


@dataclass
class ArticleItem:
    headline: str = ""
    author: str = ""
    publish_date: str = ""
    summary: str = ""


@dataclass
class BarronsSearchResult:
    query: str = ""
    items: List[ArticleItem] = field(default_factory=list)


def search_barrons(page: Page, request: BarronsSearchRequest) -> BarronsSearchResult:
    """Search Barron's for articles."""
    encoded = quote_plus(request.query)
    url = f"https://www.barrons.com/search?query={encoded}"
    print(f"Loading {url}...")
    checkpoint("Navigate to search")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(6000)

    result = BarronsSearchResult(query=request.query)

    checkpoint("Extract articles")
    js_code = """(max) => {
        const items = [];
        const cards = document.querySelectorAll('article, [class*="SearchResult"], [class*="search-result"], [class*="article-list"] li, [class*="story"]');
        for (const card of cards) {
            if (items.length >= max) break;
            const text = (card.textContent || '').replace(/\\s+/g, ' ').trim();

            let headline = '';
            const headEl = card.querySelector('h2, h3, h4, [class*="headline"], [class*="title"] a, a[class*="headline"]');
            if (headEl) headline = headEl.textContent.trim();
            if (!headline || headline.length < 10) continue;
            if (items.some(i => i.headline === headline)) continue;

            let author = '';
            const authorEl = card.querySelector('[class*="author"], [class*="byline"], [class*="writer"]');
            if (authorEl) author = authorEl.textContent.replace(/^by\\s*/i, '').trim();

            let date = '';
            const dateEl = card.querySelector('time, [class*="date"], [class*="timestamp"]');
            if (dateEl) date = (dateEl.getAttribute('datetime') || dateEl.textContent).trim();

            let summary = '';
            const summEl = card.querySelector('p, [class*="summary"], [class*="description"], [class*="snippet"]');
            if (summEl) summary = summEl.textContent.trim().substring(0, 200);

            items.push({headline: headline, author: author, publish_date: date, summary: summary});
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = ArticleItem()
        item.headline = d.get("headline", "")
        item.author = d.get("author", "")
        item.publish_date = d.get("publish_date", "")
        item.summary = d.get("summary", "")
        result.items.append(item)

    print(f"\nFound {len(result.items)} articles for '{request.query}':")
    for i, item in enumerate(result.items, 1):
        print(f"\n  {i}. {item.headline}")
        print(f"     Author: {item.author}  Date: {item.publish_date}")
        print(f"     {item.summary[:100]}...")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("barrons")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            result = search_barrons(page, BarronsSearchRequest())
            print("\n=== DONE ===")
            print(f"Found {len(result.items)} articles")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
