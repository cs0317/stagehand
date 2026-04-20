"""
Playwright script (Python) — Cookstr Recipe Search
Search for recipes on Cookstr.
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
class CookstrSearchRequest:
    query: str = "pasta"
    max_results: int = 5


@dataclass
class RecipeItem:
    name: str = ""
    cookbook_title: str = ""
    author: str = ""
    cuisine_type: str = ""


@dataclass
class CookstrSearchResult:
    query: str = ""
    items: List[RecipeItem] = field(default_factory=list)


def search_cookstr(page: Page, request: CookstrSearchRequest) -> CookstrSearchResult:
    """Search Cookstr for recipes."""
    encoded = quote_plus(request.query)
    url = f"https://www.cookstr.com/search?q={encoded}"
    print(f"Loading {url}...")
    checkpoint("Navigate to search")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(6000)

    result = CookstrSearchResult(query=request.query)

    checkpoint("Extract recipes")
    js_code = """(max) => {
        const items = [];
        const cards = document.querySelectorAll('[class*="recipe"], [class*="result"], [class*="card"], article');
        for (const card of cards) {
            if (items.length >= max) break;
            const text = (card.textContent || '').replace(/\\s+/g, ' ').trim();

            let name = '';
            const nameEl = card.querySelector('h2 a, h3 a, [class*="title"] a, [class*="name"] a');
            if (nameEl) name = nameEl.textContent.trim();
            if (!name || name.length < 3 || name.length > 200) continue;
            if (items.some(i => i.name === name)) continue;

            let cookbook = '';
            const bookEl = card.querySelector('[class*="cookbook"], [class*="book"], [class*="source"]');
            if (bookEl) cookbook = bookEl.textContent.trim();

            let author = '';
            const authorEl = card.querySelector('[class*="author"], [class*="chef"]');
            if (authorEl) author = authorEl.textContent.replace(/^by\\s*/i, '').trim();

            let cuisine = '';
            const cuisineEl = card.querySelector('[class*="cuisine"], [class*="category"], [class*="tag"]');
            if (cuisineEl) cuisine = cuisineEl.textContent.trim();

            items.push({name: name, cookbook_title: cookbook, author: author, cuisine_type: cuisine});
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = RecipeItem()
        item.name = d.get("name", "")
        item.cookbook_title = d.get("cookbook_title", "")
        item.author = d.get("author", "")
        item.cuisine_type = d.get("cuisine_type", "")
        result.items.append(item)

    print(f"\nFound {len(result.items)} recipes for '{request.query}':")
    for i, item in enumerate(result.items, 1):
        print(f"\n  {i}. {item.name}")
        print(f"     Cookbook: {item.cookbook_title}  Author: {item.author}  Cuisine: {item.cuisine_type}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("cookstr")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            result = search_cookstr(page, CookstrSearchRequest())
            print("\n=== DONE ===")
            print(f"Found {len(result.items)} recipes")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
