"""
Polygon – Search for gaming and entertainment articles by keyword

Uses CDP-launched Chrome to avoid bot detection.
"""

import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class PolygonSearchRequest:
    search_query: str = "nintendo"
    max_results: int = 5


@dataclass
class PolygonArticleItem:
    title: str = ""
    author: str = ""
    publish_date: str = ""
    category: str = ""
    summary: str = ""


@dataclass
class PolygonSearchResult:
    items: List[PolygonArticleItem] = field(default_factory=list)


# Search for gaming and entertainment articles on Polygon by keyword.
def polygon_search(page: Page, request: PolygonSearchRequest) -> PolygonSearchResult:
    """Search for gaming and entertainment articles on Polygon."""
    print(f"  Query: {request.search_query}\n")

    query = request.search_query.replace(" ", "+")
    url = f"https://www.polygon.com/search?q={query}"
    print(f"Loading {url}...")
    checkpoint("Navigate to Polygon search results")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    result = PolygonSearchResult()

    checkpoint("Extract article listings")
    js_code = """(max) => {
        const links = document.querySelectorAll('a[href]');
        const seen = new Set();
        const items = [];
        for (const a of links) {
            if (items.length >= max) break;
            const href = a.getAttribute('href') || '';
            // Match Polygon article paths like /2025/4/18/...
            if (!/\\/\\d{4}\\/\\d{1,2}\\/\\d{1,2}\\//.test(href)) continue;
            const fullUrl = href.startsWith('http') ? href : 'https://www.polygon.com' + href;
            if (seen.has(fullUrl)) continue;
            seen.add(fullUrl);
            const title = a.textContent.trim();
            if (!title || title.length < 10 || title.length > 300) continue;
            items.push({title, author: '', publish_date: '', category: '', summary: ''});
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = PolygonArticleItem()
        item.title = d.get("title", "")
        item.author = d.get("author", "")
        item.publish_date = d.get("publish_date", "")
        item.category = d.get("category", "")
        item.summary = d.get("summary", "")
        result.items.append(item)

    for i, item in enumerate(result.items, 1):
        print(f"\n  Article {i}:")
        print(f"    Title:    {item.title}")
        print(f"    Author:   {item.author}")
        print(f"    Date:     {item.publish_date}")
        print(f"    Category: {item.category}")
        print(f"    Summary:  {item.summary[:100]}...")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("polygon")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            request = PolygonSearchRequest()
            result = polygon_search(page, request)
            print("\n=== DONE ===")
            print(f"Found {len(result.items)} articles")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
