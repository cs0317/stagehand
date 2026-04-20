"""Playwright script (Python) — Reddit Community Search"""
import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint

@dataclass(frozen=True)
class RedditRequest:
    query: str = "photography"
    max_results: int = 5

@dataclass
class SubredditItem:
    name: str = ""
    members: str = ""
    description: str = ""
    online: str = ""

@dataclass
class RedditResult:
    subreddits: List[SubredditItem] = field(default_factory=list)

def search_reddit_communities(page: Page, request: RedditRequest) -> RedditResult:
    url = f"https://www.reddit.com/search/?q={request.query.replace(' ', '+')}&type=sr"
    checkpoint("Navigate to Reddit search")
    page.goto(url, wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(8000)
    result = RedditResult()
    js_code = """(max) => {
        const results = [];
        const items = document.querySelectorAll('faceplate-tracker[noun="community_search"], [class*="community"]');
        for (const item of items) {
            if (results.length >= max) break;
            const nameEl = item.querySelector('a[href*="/r/"]');
            const name = nameEl ? nameEl.textContent.trim() : '';
            if (!name) continue;
            const text = item.textContent;
            const memberMatch = text.match(/([\d,.]+[KMkm]?)\s*members/);
            results.push({ name, members: memberMatch ? memberMatch[1] : '', description: '', online: '' });
        }
        return results;
    }"""
    for d in page.evaluate(js_code, request.max_results):
        item = SubredditItem()
        item.name = d.get("name", "")
        item.members = d.get("members", "")
        result.subreddits.append(item)
    print(f"Found {len(result.subreddits)} subreddits")
    return result

def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("reddit")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            search_reddit_communities(page, RedditRequest())
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)

if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
