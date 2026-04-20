"""Playwright script (Python) — Women's Health"""
import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint

@dataclass(frozen=True)
class WomensHealthRequest:
    query: str = "fitness"
    max_results: int = 5

@dataclass
class ArticleItem:
    title: str = ""
    author: str = ""
    date: str = ""
    category: str = ""
    summary: str = ""

@dataclass
class WomensHealthResult:
    articles: List[ArticleItem] = field(default_factory=list)

def search_womenshealth(page: Page, request: WomensHealthRequest) -> WomensHealthResult:
    url = f"https://www.womenshealthmag.com/{request.query.replace(' ', '-').lower()}/"
    checkpoint("Navigate to Women's Health category")
    page.goto(url, wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(8000)
    result = WomensHealthResult()
    js_code = """(max) => {
        const results = [];
        const seen = new Set();
        const h3s = document.querySelectorAll('h3');
        for (const h3 of h3s) {
            if (results.length >= max) break;
            const title = h3.innerText.trim();
            if (!title || title.length < 15 || seen.has(title)) continue;
            if (title.match(/^(Subscribe|Sign|Menu|Search|Privacy|Cookie|Filter|Sort|Newsletter|WH[+]|More From)/i)) continue;
            seen.add(title);
            results.push({ title, author: '', date: '', category: '', summary: '' });
        }
        return results;
    }"""
    for d in page.evaluate(js_code, request.max_results):
        item = ArticleItem()
        item.title = d.get("title", "")
        item.author = d.get("author", "")
        item.date = d.get("date", "")
        item.category = d.get("category", "")
        item.summary = d.get("summary", "")
        result.articles.append(item)
    print(f"Found {len(result.articles)} articles")
    return result

def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("womenshealth")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            search_womenshealth(page, WomensHealthRequest())
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)

if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
