"""
Playwright script (Python) — Chowhound Search
Search for food articles on Chowhound.
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
class ChowhoundSearchRequest:
    query: str = "best pizza in Chicago"
    max_results: int = 5


@dataclass
class ArticleItem:
    title: str = ""
    author: str = ""
    publish_date: str = ""
    summary: str = ""


@dataclass
class ChowhoundSearchResult:
    query: str = ""
    items: List[ArticleItem] = field(default_factory=list)


def search_chowhound(page: Page, request: ChowhoundSearchRequest) -> ChowhoundSearchResult:
    """Search Chowhound for food articles."""
    encoded = quote_plus(request.query)
    url = f"https://www.chowhound.com/search?q={encoded}"
    print(f"Loading {url}...")
    checkpoint("Navigate to search")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(6000)

    result = ChowhoundSearchResult(query=request.query)

    checkpoint("Extract articles")
    js_code = """(max) => {
        const items = [];
        const cards = document.querySelectorAll('[class*="card"], [class*="result"], article, [class*="mntl-card"]');
        for (const card of cards) {
            if (items.length >= max) break;

            let title = '';
            const titleEl = card.querySelector('[class*="title"], h3, h4, span[class*="card__title"]');
            if (titleEl) title = titleEl.textContent.trim();
            if (!title || title.length < 5 || title.length > 300) continue;
            if (items.some(i => i.title === title)) continue;

            let author = '';
            const authorEl = card.querySelector('[class*="byline"], [class*="author"]');
            if (authorEl) author = authorEl.textContent.replace(/^by\\s*/i, '').trim();

            let date = '';
            const dateEl = card.querySelector('[class*="date"], time');
            if (dateEl) date = (dateEl.getAttribute('datetime') || dateEl.textContent).trim();

            let summary = '';
            const descEl = card.querySelector('[class*="description"], p');
            if (descEl) summary = descEl.textContent.trim().substring(0, 200);

            items.push({title: title, author: author, publish_date: date, summary: summary});
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = ArticleItem()
        item.title = d.get("title", "")
        item.author = d.get("author", "")
        item.publish_date = d.get("publish_date", "")
        item.summary = d.get("summary", "")
        result.items.append(item)

    print(f"\nFound {len(result.items)} articles for '{request.query}':")
    for i, item in enumerate(result.items, 1):
        print(f"\n  {i}. {item.title}")
        print(f"     Author: {item.author}  Date: {item.publish_date}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("chowhound")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            result = search_chowhound(page, ChowhoundSearchRequest())
            print("\n=== DONE ===")
            print(f"Found {len(result.items)} articles")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
