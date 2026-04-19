"""
The Kitchn – Search for recipes and kitchen tips by keyword

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
class ThekitchnSearchRequest:
    search_query: str = "chocolate chip cookies"
    max_results: int = 5


@dataclass
class ThekitchnArticleItem:
    title: str = ""
    author: str = ""
    category: str = ""
    summary: str = ""
    image_url: str = ""


@dataclass
class ThekitchnSearchResult:
    items: List[ThekitchnArticleItem] = field(default_factory=list)


# Search for recipes and kitchen tips on The Kitchn by keyword.
def thekitchn_search(page: Page, request: ThekitchnSearchRequest) -> ThekitchnSearchResult:
    """Search for recipes and kitchen tips on The Kitchn."""
    print(f"  Query: {request.search_query}\n")

    query = request.search_query.replace(" ", "+")
    url = f"https://www.thekitchn.com/search?q={query}&t=recipe"
    print(f"Loading {url}...")
    checkpoint("Navigate to The Kitchn search results")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    result = ThekitchnSearchResult()

    checkpoint("Extract article listings")
    js_code = """(max) => {
        const links = document.querySelectorAll('a[href]');
        const items = [];
        const seen = new Set();
        for (const a of links) {
            if (items.length >= max) break;
            const href = a.getAttribute('href') || '';
            // Match article/recipe links
            if (!href.match(/thekitchn\\.com\\/.+-\\d+$/)) continue;
            const text = a.textContent.trim();
            if (!text || text.length < 10 || text.length > 200) continue;
            if (seen.has(href)) continue;
            seen.add(href);
            items.push({title: text, author: '', category: '', summary: '', image_url: ''});
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = ThekitchnArticleItem()
        item.title = d.get("title", "")
        item.author = d.get("author", "")
        item.category = d.get("category", "")
        item.summary = d.get("summary", "")
        item.image_url = d.get("image_url", "")
        result.items.append(item)

    for i, item in enumerate(result.items, 1):
        print(f"\n  Article {i}:")
        print(f"    Title:    {item.title}")
        print(f"    Author:   {item.author}")
        print(f"    Category: {item.category}")
        print(f"    Summary:  {item.summary[:100]}...")
        print(f"    Image:    {item.image_url[:80]}...")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("thekitchn")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            request = ThekitchnSearchRequest()
            result = thekitchn_search(page, request)
            print("\n=== DONE ===")
            print(f"Found {len(result.items)} articles")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
