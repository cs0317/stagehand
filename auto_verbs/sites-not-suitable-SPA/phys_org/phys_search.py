"""
Playwright script (Python) — Phys.org Article Search
Search Phys.org for CRISPR gene editing articles.
"""

import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class PhysRequest:
    query: str = "CRISPR gene editing"
    max_results: int = 5


@dataclass
class ArticleItem:
    title: str = ""
    source: str = ""
    date: str = ""
    summary: str = ""


@dataclass
class PhysResult:
    articles: List[ArticleItem] = field(default_factory=list)


# Searches Phys.org for articles and extracts title,
# source institution, publish date, and summary.
def search_phys(page: Page, request: PhysRequest) -> PhysResult:
    url = f"https://phys.org/search/?search={request.query.replace(' ', '+')}"
    print(f"Loading {url}...")
    checkpoint("Navigate to Phys.org search")
    page.goto(url, wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(8000)

    result = PhysResult()

    checkpoint("Extract article results")
    js_code = """(max) => {
        const results = [];
        const articles = document.querySelectorAll('article, [class*="news-item"], [class*="article-item"]');
        for (const art of articles) {
            if (results.length >= max) break;
            const titleEl = art.querySelector('h3, h2, [class*="title"] a');
            const title = titleEl ? titleEl.textContent.trim() : '';
            if (!title || title.length < 5) continue;

            const sourceEl = art.querySelector('[class*="source"], [class*="institution"]');
            const source = sourceEl ? sourceEl.textContent.trim() : '';

            const dateEl = art.querySelector('time, [class*="date"]');
            const date = dateEl ? dateEl.textContent.trim() : '';

            const summaryEl = art.querySelector('p, [class*="summary"], [class*="desc"]');
            const summary = summaryEl ? summaryEl.textContent.trim().substring(0, 200) : '';

            results.push({ title, source, date, summary });
        }
        return results;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = ArticleItem()
        item.title = d.get("title", "")
        item.source = d.get("source", "")
        item.date = d.get("date", "")
        item.summary = d.get("summary", "")
        result.articles.append(item)

    print(f"\nFound {len(result.articles)} articles:")
    for i, a in enumerate(result.articles, 1):
        print(f"\n  {i}. {a.title}")
        print(f"     Source: {a.source}  Date: {a.date}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("phys")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            result = search_phys(page, PhysRequest())
            print("\n=== DONE ===")
            print(f"Found {len(result.articles)} articles")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
