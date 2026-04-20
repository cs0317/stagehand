"""
Playwright script (Python) — Barnes & Noble Search
Search for bestselling books on Barnes & Noble.
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
class BNSearchRequest:
    query: str = "fiction"
    max_results: int = 5


@dataclass
class BookItem:
    title: str = ""
    author: str = ""
    book_format: str = ""
    price: str = ""
    rating: str = ""


@dataclass
class BNSearchResult:
    query: str = ""
    items: List[BookItem] = field(default_factory=list)


def search_bn(page: Page, request: BNSearchRequest) -> BNSearchResult:
    """Search Barnes & Noble for books."""
    encoded = quote_plus(request.query)
    url = f"https://www.barnesandnoble.com/s/{encoded}?Ns=p_best_seller_rank&Nd=1"
    print(f"Loading {url}...")
    checkpoint("Navigate to search")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(6000)

    result = BNSearchResult(query=request.query)

    checkpoint("Extract books")
    js_code = """(max) => {
        const items = [];
        const cards = document.querySelectorAll('.product-shelf-tile, [class*="product-tile"], [class*="product-info"], .product-listing');
        for (const card of cards) {
            if (items.length >= max) break;
            const text = (card.textContent || '').replace(/\\s+/g, ' ').trim();

            let title = '';
            const titleEl = card.querySelector('h3 a, h2 a, [class*="title"] a, .product-shelf-title a');
            if (titleEl) title = titleEl.textContent.trim();
            if (!title || title.length < 2) continue;

            let author = '';
            const authorEl = card.querySelector('[class*="author"], .product-shelf-author, .contributors');
            if (authorEl) author = authorEl.textContent.replace(/^by\\s*/i, '').trim();

            let price = '';
            const priceEl = card.querySelector('[class*="price"], .product-shelf-pricing');
            if (priceEl) {
                const priceMatch = priceEl.textContent.match(/\\$[\\d.]+/);
                if (priceMatch) price = priceMatch[0];
            }

            let fmt = '';
            const fmtEl = card.querySelector('[class*="format"], .product-shelf-format');
            if (fmtEl) fmt = fmtEl.textContent.trim();
            if (!fmt) {
                const fmtMatch = text.match(/(hardcover|paperback|ebook|audio)/i);
                if (fmtMatch) fmt = fmtMatch[1];
            }

            let rating = '';
            const ratingEl = card.querySelector('[class*="rating"], [class*="star"]');
            if (ratingEl) {
                const rMatch = ratingEl.textContent.match(/(\\d+\\.?\\d*)/);
                if (rMatch) rating = rMatch[1];
            }

            items.push({title: title, author: author, book_format: fmt, price: price, rating: rating});
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = BookItem()
        item.title = d.get("title", "")
        item.author = d.get("author", "")
        item.book_format = d.get("book_format", "")
        item.price = d.get("price", "")
        item.rating = d.get("rating", "")
        result.items.append(item)

    print(f"\nFound {len(result.items)} books for '{request.query}':")
    for i, item in enumerate(result.items, 1):
        print(f"\n  {i}. {item.title}")
        print(f"     Author: {item.author}  Format: {item.book_format}  Price: {item.price}  Rating: {item.rating}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("bn")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            result = search_bn(page, BNSearchRequest())
            print("\n=== DONE ===")
            print(f"Found {len(result.items)} books")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
