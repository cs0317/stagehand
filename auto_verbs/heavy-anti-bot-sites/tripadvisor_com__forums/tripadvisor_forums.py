"""Playwright script (Python) — TripAdvisor Forums"""
import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint

@dataclass(frozen=True)
class TripAdvisorForumsRequest:
    query: str = "Japan travel tips"
    max_results: int = 5

@dataclass
class ForumPost:
    title: str = ""
    forum: str = ""
    author: str = ""
    replies: str = ""
    last_reply: str = ""

@dataclass
class TripAdvisorForumsResult:
    posts: List[ForumPost] = field(default_factory=list)

def search_tripadvisor_forums(page: Page, request: TripAdvisorForumsRequest) -> TripAdvisorForumsResult:
    url = f"https://www.tripadvisor.com/Search?q={request.query.replace(' ', '+')}"
    checkpoint("Navigate to TripAdvisor search")
    page.goto(url, wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(5000)
    result = TripAdvisorForumsResult()
    js_code = """(max) => {
        const results = [];
        const items = document.querySelectorAll('[class*="result"], [class*="search-result"], article');
        for (const item of items) {
            if (results.length >= max) break;
            const titleEl = item.querySelector('a[class*="title"], h3 a, h2 a');
            const title = titleEl ? titleEl.textContent.trim() : '';
            if (!title) continue;
            results.push({ title, forum: '', author: '', replies: '', last_reply: '' });
        }
        return results;
    }"""
    for d in page.evaluate(js_code, request.max_results):
        item = ForumPost()
        item.title = d.get("title", "")
        result.posts.append(item)
    print(f"Found {len(result.posts)} forum posts")
    return result

def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("tripadvisor_forums")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            search_tripadvisor_forums(page, TripAdvisorForumsRequest())
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)

if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
