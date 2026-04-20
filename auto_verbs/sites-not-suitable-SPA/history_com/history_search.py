"""
Playwright script (Python) — History.com Article Search
Search History.com for historical articles.
"""

import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class HistorySearchRequest:
    search_query: str = "World War II"
    max_results: int = 5


@dataclass
class ArticleItem:
    title: str = ""
    author: str = ""
    publish_date: str = ""
    category: str = ""
    summary: str = ""


@dataclass
class HistorySearchResult:
    query: str = ""
    items: List[ArticleItem] = field(default_factory=list)


# Searches History.com for articles matching the query and returns
# up to max_results articles with title, author, publish date, category, and summary.
def search_history(page: Page, request: HistorySearchRequest) -> HistorySearchResult:
    import urllib.parse
    url = f"https://www.history.com/search?q={urllib.parse.quote_plus(request.search_query)}"
    print(f"Loading {url}...")
    checkpoint("Navigate to search results")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    result = HistorySearchResult(query=request.search_query)

    checkpoint("Extract article listings")
    js_code = """(max) => {
        const results = [];
        // History.com uses H3 for article titles in search results
        const h3s = document.querySelectorAll('h3');
        for (const h3 of h3s) {
            if (results.length >= max) break;
            const title = h3.innerText.trim();
            if (!title || title.length < 5) continue;
            if (title.match(/^(Create|Sign|Log|Popular|Related)/)) continue;
            if (results.some(r => r.title === title)) continue;

            const card = h3.closest('div') || h3.parentElement;
            const text = card ? card.innerText : '';

            let author = '';
            const authorMatch = text.match(/by\\s+([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)+)/);
            if (authorMatch) author = authorMatch[1];

            let publishDate = '';
            const dateEl = card ? card.querySelector('time, [datetime]') : null;
            if (dateEl) publishDate = dateEl.textContent.trim() || dateEl.getAttribute('datetime') || '';

            let category = '';
            let summary = '';

            results.push({ title, author, publish_date: publishDate, category, summary });
        }
        return results;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = ArticleItem()
        item.title = d.get("title", "")
        item.author = d.get("author", "")
        item.publish_date = d.get("publish_date", "")
        item.category = d.get("category", "")
        item.summary = d.get("summary", "")
        result.items.append(item)

    print(f"\nFound {len(result.items)} articles for '{request.search_query}':")
    for i, item in enumerate(result.items, 1):
        print(f"\n  {i}. {item.title}")
        print(f"     Author: {item.author}  Date: {item.publish_date}")
        print(f"     Category: {item.category}")
        if item.summary:
            print(f"     {item.summary[:100]}...")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("history")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            result = search_history(page, HistorySearchRequest())
            print("\n=== DONE ===")
            print(f"Found {len(result.items)} articles")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
