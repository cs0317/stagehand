"""Playwright script (Python) — World History Encyclopedia"""
import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint

@dataclass(frozen=True)
class WorldHistoryRequest:
    query: str = "Roman Empire"
    max_results: int = 5

@dataclass
class ArticleItem:
    title: str = ""
    author: str = ""
    date: str = ""
    summary: str = ""

@dataclass
class WorldHistoryResult:
    articles: List[ArticleItem] = field(default_factory=list)

def search_worldhistory(page: Page, request: WorldHistoryRequest) -> WorldHistoryResult:
    url = f"https://www.worldhistory.org/search/?q={request.query.replace(' ', '+')}"
    checkpoint("Navigate to World History search")
    page.goto(url, wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(8000)
    result = WorldHistoryResult()
    js_code = """(max) => {
        const results = [];
        const cards = document.querySelectorAll('.result, [class*="search-result"], article, .item');
        for (const card of cards) {
            if (results.length >= max) break;
            const titleEl = card.querySelector('h3, h2, a[class*="title"]');
            const title = titleEl ? titleEl.textContent.trim() : '';
            if (!title) continue;
            const authorEl = card.querySelector('[class*="author"], [class*="byline"]');
            const author = authorEl ? authorEl.textContent.trim() : '';
            const dateEl = card.querySelector('[class*="date"], time');
            const date = dateEl ? dateEl.textContent.trim() : '';
            const summaryEl = card.querySelector('p, [class*="description"]');
            const summary = summaryEl ? summaryEl.textContent.trim() : '';
            results.push({ title, author, date, summary });
        }
        return results;
    }"""
    for d in page.evaluate(js_code, request.max_results):
        item = ArticleItem()
        item.title = d.get("title", "")
        item.author = d.get("author", "")
        item.date = d.get("date", "")
        item.summary = d.get("summary", "")
        result.articles.append(item)
    print(f"Found {len(result.articles)} articles")
    return result

def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("worldhistory")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            search_worldhistory(page, WorldHistoryRequest())
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)

if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
