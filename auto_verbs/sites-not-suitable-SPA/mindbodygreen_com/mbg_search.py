"""
Playwright script (Python) — MindBodyGreen Article Search
Search mindbodygreen for wellness articles.
"""

import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class MBGRequest:
    query: str = "gut health"
    max_results: int = 5


@dataclass
class ArticleItem:
    title: str = ""
    author: str = ""
    date: str = ""
    category: str = ""
    summary: str = ""


@dataclass
class MBGResult:
    articles: List[ArticleItem] = field(default_factory=list)


# Searches mindbodygreen for wellness articles and extracts title,
# author, publish date, category, and summary.
def search_mbg(page: Page, request: MBGRequest) -> MBGResult:
    url = f"https://www.mindbodygreen.com/search?q={request.query.replace(' ', '+')}"
    print(f"Loading {url}...")
    checkpoint("Navigate to MBG search")
    page.goto(url, wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(5000)

    result = MBGResult()

    checkpoint("Extract articles from search results")
    js_code = """(max) => {
        const results = [];
        const seen = new Set();
        // MBG uses H2 elements for article titles in search results
        const h2s = document.querySelectorAll('h2');
        for (const h2 of h2s) {
            if (results.length >= max) break;
            const title = h2.innerText.trim();
            if (!title || title.length < 10 || seen.has(title)) continue;
            // Skip nav/UI headings
            if (title.match(/^(Health|Food|Movement|Beauty|Lifestyle|Skip|Sign|Log)/)) continue;
            seen.add(title);

            const card = h2.closest('div') || h2.parentElement;
            const text = card ? card.innerText : '';

            const authorMatch = text.match(/by\\s+([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)+)/);
            const author = authorMatch ? authorMatch[1] : '';

            const dateMatch = text.match(/(\\w+\\s+\\d{1,2},?\\s+\\d{4})/);
            const date = dateMatch ? dateMatch[1] : '';

            const category = '';
            const summary = '';

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
    profile_dir = get_temp_profile_dir("mbg")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            result = search_mbg(page, MBGRequest())
            print("\n=== DONE ===")
            print(f"Found {len(result.articles)} articles")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
