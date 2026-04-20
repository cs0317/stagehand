"""
Playwright script (Python) — Modern Farmer Article Search
Search Modern Farmer for articles about regenerative agriculture.
"""

import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class ModernFarmerRequest:
    query: str = "regenerative agriculture"
    max_results: int = 5


@dataclass
class ArticleItem:
    title: str = ""
    author: str = ""
    date: str = ""
    category: str = ""
    summary: str = ""


@dataclass
class ModernFarmerResult:
    articles: List[ArticleItem] = field(default_factory=list)


# Searches Modern Farmer for articles and extracts title,
# author, publish date, category, and summary.
def search_modernfarmer(page: Page, request: ModernFarmerRequest) -> ModernFarmerResult:
    url = f"https://modernfarmer.com/?s={request.query.replace(' ', '+')}"
    print(f"Loading {url}...")
    checkpoint("Navigate to Modern Farmer search")
    page.goto(url, wait_until="domcontentloaded", timeout=45000)
    page.wait_for_timeout(8000)

    result = ModernFarmerResult()

    checkpoint("Extract articles")
    js_code = """(max) => {
        const results = [];
        const items = document.querySelectorAll('article, .post, [class*="entry"]');
        for (const item of items) {
            if (results.length >= max) break;
            const titleEl = item.querySelector('h2 a, h3 a, .entry-title a');
            const title = titleEl ? titleEl.textContent.trim() : '';
            if (!title) continue;

            const authorEl = item.querySelector('.author a, [class*="author"], .byline a');
            const author = authorEl ? authorEl.textContent.trim() : '';

            const dateEl = item.querySelector('time, .entry-date, [class*="date"]');
            const date = dateEl ? dateEl.textContent.trim() : '';

            const catEl = item.querySelector('.cat-links a, [class*="category"] a');
            const category = catEl ? catEl.textContent.trim() : '';

            const summaryEl = item.querySelector('.entry-summary, .excerpt, p');
            const summary = summaryEl ? summaryEl.textContent.trim().substring(0, 200) : '';

            results.push({ title, author, date, category, summary });
        }
        return results;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = ArticleItem()
        item.title = d.get("title", "")
        item.author = d.get("author", "")
        item.date = d.get("date", "")
        item.category = d.get("category", "")
        item.summary = d.get("summary", "")
        result.articles.append(item)

    print(f"\nFound {len(result.articles)} articles:")
    for i, a in enumerate(result.articles, 1):
        print(f"\n  {i}. {a.title}")
        print(f"     Author: {a.author}  Date: {a.date}")
        print(f"     Category: {a.category}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("modernfarmer")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            result = search_modernfarmer(page, ModernFarmerRequest())
            print("\n=== DONE ===")
            print(f"Found {len(result.articles)} articles")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
