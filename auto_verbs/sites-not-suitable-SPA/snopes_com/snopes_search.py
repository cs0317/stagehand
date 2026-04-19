"""
Snopes – Search for fact-check articles by keyword

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
class SnopesSearchRequest:
    search_query: str = "vaccine"
    max_results: int = 5


@dataclass
class SnopesArticleItem:
    title: str = ""
    rating: str = ""
    publish_date: str = ""
    claim: str = ""
    summary: str = ""


@dataclass
class SnopesSearchResult:
    items: List[SnopesArticleItem] = field(default_factory=list)


# Search for fact-check articles on Snopes by keyword.
def snopes_search(page: Page, request: SnopesSearchRequest) -> SnopesSearchResult:
    """Search for fact-check articles on Snopes."""
    print(f"  Query: {request.search_query}\n")

    query = request.search_query.replace(" ", "+")
    url = f"https://www.snopes.com/?s={query}"
    print(f"Loading {url}...")
    checkpoint("Navigate to Snopes search results")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    result = SnopesSearchResult()

    checkpoint("Extract fact-check article listings")
    js_code = """(max) => {
        const links = document.querySelectorAll('a[href]');
        const seen = new Set();
        const items = [];
        for (const a of links) {
            if (items.length >= max) break;
            const href = a.getAttribute('href') || '';
            // Match Snopes fact-check paths like /fact-check/...
            if (!/\\/fact-check\\/.+/.test(href)) continue;
            if (seen.has(href)) continue;
            seen.add(href);
            const title = a.textContent.trim();
            if (!title || title.length < 10 || title.length > 300) continue;
            items.push({title, rating: '', publish_date: '', claim: '', summary: ''});
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = SnopesArticleItem()
        item.title = d.get("title", "")
        item.rating = d.get("rating", "")
        item.publish_date = d.get("publish_date", "")
        item.claim = d.get("claim", "")
        item.summary = d.get("summary", "")
        result.items.append(item)

    for i, item in enumerate(result.items, 1):
        print(f"\n  Article {i}:")
        print(f"    Title:   {item.title}")
        print(f"    Rating:  {item.rating}")
        print(f"    Date:    {item.publish_date}")
        print(f"    Claim:   {item.claim[:80]}...")
        print(f"    Summary: {item.summary[:100]}...")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("snopes")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            request = SnopesSearchRequest()
            result = snopes_search(page, request)
            print("\n=== DONE ===")
            print(f"Found {len(result.items)} fact-check articles")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
