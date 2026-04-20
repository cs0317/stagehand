"""
Playwright script (Python) — Chegg Search
Search for textbook solutions on Chegg.
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
class CheggSearchRequest:
    query: str = "calculus"
    max_results: int = 5


@dataclass
class TextbookItem:
    title: str = ""
    author: str = ""
    edition: str = ""
    num_solutions: str = ""
    price: str = ""


@dataclass
class CheggSearchResult:
    query: str = ""
    items: List[TextbookItem] = field(default_factory=list)


def search_chegg(page: Page, request: CheggSearchRequest) -> CheggSearchResult:
    """Search Chegg for textbook solutions."""
    encoded = quote_plus(request.query)
    url = f"https://www.chegg.com/homework-help/search?q={encoded}"
    print(f"Loading {url}...")
    checkpoint("Navigate to search")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(6000)

    result = CheggSearchResult(query=request.query)

    checkpoint("Extract textbooks")
    js_code = """(max) => {
        const items = [];
        const cards = document.querySelectorAll('[class*="result"], [class*="textbook"], [class*="card"], article, [class*="item"]');
        for (const card of cards) {
            if (items.length >= max) break;
            const text = (card.textContent || '').replace(/\\s+/g, ' ').trim();

            let title = '';
            const titleEl = card.querySelector('h2 a, h3 a, [class*="title"], a[class*="title"]');
            if (titleEl) title = titleEl.textContent.trim();
            if (!title || title.length < 5 || title.length > 300) continue;
            if (items.some(i => i.title === title)) continue;

            let author = '';
            const authorEl = card.querySelector('[class*="author"]');
            if (authorEl) author = authorEl.textContent.replace(/^by\\s*/i, '').trim();

            let edition = '';
            const edMatch = text.match(/(\\d+(?:st|nd|rd|th)\\s*edition)/i);
            if (edMatch) edition = edMatch[1];

            let solutions = '';
            const solMatch = text.match(/(\\d[\\d,]*)\\s*(?:solution|answer|problem)/i);
            if (solMatch) solutions = solMatch[1];

            let price = '';
            const priceMatch = text.match(/\\$[\\d,.]+/);
            if (priceMatch) price = priceMatch[0];

            items.push({title: title, author: author, edition: edition, num_solutions: solutions, price: price});
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = TextbookItem()
        item.title = d.get("title", "")
        item.author = d.get("author", "")
        item.edition = d.get("edition", "")
        item.num_solutions = d.get("num_solutions", "")
        item.price = d.get("price", "")
        result.items.append(item)

    print(f"\nFound {len(result.items)} textbooks for '{request.query}':")
    for i, item in enumerate(result.items, 1):
        print(f"\n  {i}. {item.title}")
        print(f"     Author: {item.author}  Edition: {item.edition}  Solutions: {item.num_solutions}  Price: {item.price}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("chegg")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            result = search_chegg(page, CheggSearchRequest())
            print("\n=== DONE ===")
            print(f"Found {len(result.items)} textbooks")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
