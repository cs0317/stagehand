"""Playwright script (Python) — Shudder"""
import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint

@dataclass(frozen=True)
class ShudderRequest:
    genre: str = "supernatural"
    max_results: int = 5

@dataclass
class MovieItem:
    title: str = ""
    year: str = ""
    director: str = ""
    duration: str = ""
    description: str = ""

@dataclass
class ShudderResult:
    movies: List[MovieItem] = field(default_factory=list)

def search_shudder(page: Page, request: ShudderRequest) -> ShudderResult:
    url = "https://www.shudder.com/"
    checkpoint("Navigate to Shudder")
    page.goto(url, wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(5000)
    result = ShudderResult()
    js_code = """(max) => {
        const results = [];
        const cards = document.querySelectorAll('[class*="movie"], [class*="title-card"], [class*="content-item"], article');
        for (const card of cards) {
            if (results.length >= max) break;
            const titleEl = card.querySelector('h2, h3, [class*="title"]');
            const title = titleEl ? titleEl.textContent.trim() : '';
            if (!title) continue;
            const descEl = card.querySelector('p, [class*="description"], [class*="synopsis"]');
            const description = descEl ? descEl.textContent.trim() : '';
            results.push({ title, year: '', director: '', duration: '', description });
        }
        return results;
    }"""
    for d in page.evaluate(js_code, request.max_results):
        item = MovieItem()
        item.title = d.get("title", "")
        item.description = d.get("description", "")
        result.movies.append(item)
    print(f"Found {len(result.movies)} movies")
    return result

def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("shudder")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            search_shudder(page, ShudderRequest())
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)

if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
