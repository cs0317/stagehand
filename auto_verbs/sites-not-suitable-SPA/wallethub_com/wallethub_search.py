"""
WalletHub – Search for personal finance articles and rankings

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
class WallethubSearchRequest:
    search_query: str = "best credit cards"
    max_results: int = 5


@dataclass
class WallethubArticleItem:
    title: str = ""
    category: str = ""
    publish_date: str = ""
    summary: str = ""
    url: str = ""


@dataclass
class WallethubSearchResult:
    items: List[WallethubArticleItem] = field(default_factory=list)


# Search for personal finance articles and rankings on WalletHub.
def wallethub_search(page: Page, request: WallethubSearchRequest) -> WallethubSearchResult:
    """Search for personal finance articles and rankings on WalletHub."""
    print(f"  Query: {request.search_query}\n")

    query = request.search_query.replace(" ", "+")
    url = f"https://wallethub.com/search?q={query}"
    print(f"Loading {url}...")
    checkpoint("Navigate to WalletHub search results")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    result = WallethubSearchResult()

    checkpoint("Extract article listings")
    js_code = """(max) => {
        const cards = document.querySelectorAll('article, [class*="search-result"], [class*="SearchResult"], [class*="result"], [class*="Card"], .item');
        const items = [];
        for (const card of cards) {
            if (items.length >= max) break;
            const titleEl = card.querySelector('h2, h3, h4, [class*="title"], [class*="headline"] a');
            const categoryEl = card.querySelector('[class*="category"], [class*="topic"], [class*="label"], [class*="type"]');
            const dateEl = card.querySelector('time, [class*="date"], [class*="time"]');
            const summaryEl = card.querySelector('p, [class*="description"], [class*="summary"], [class*="excerpt"]');
            const linkEl = card.querySelector('a[href]');

            const title = titleEl ? titleEl.textContent.trim() : '';
            const category = categoryEl ? categoryEl.textContent.trim() : '';
            const publish_date = dateEl ? (dateEl.getAttribute('datetime') || dateEl.textContent.trim()) : '';
            const summary = summaryEl ? summaryEl.textContent.trim() : '';
            const url = linkEl ? linkEl.href : '';

            if (title) {
                items.push({title, category, publish_date, summary, url});
            }
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = WallethubArticleItem()
        item.title = d.get("title", "")
        item.category = d.get("category", "")
        item.publish_date = d.get("publish_date", "")
        item.summary = d.get("summary", "")
        item.url = d.get("url", "")
        result.items.append(item)

    for i, item in enumerate(result.items, 1):
        print(f"\n  Result {i}:")
        print(f"    Title:    {item.title}")
        print(f"    Category: {item.category}")
        print(f"    Date:     {item.publish_date}")
        print(f"    Summary:  {item.summary[:100]}...")
        print(f"    URL:      {item.url}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("wallethub")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            request = WallethubSearchRequest()
            result = wallethub_search(page, request)
            print("\n=== DONE ===")
            print(f"Found {len(result.items)} results")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
