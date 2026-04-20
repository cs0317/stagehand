"""Playwright script (Python) — YouTube Shorts"""
import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint

@dataclass(frozen=True)
class YouTubeShortsRequest:
    max_results: int = 5

@dataclass
class ShortItem:
    title: str = ""
    channel: str = ""
    views: str = ""
    likes: str = ""

@dataclass
class YouTubeShortsResult:
    shorts: List[ShortItem] = field(default_factory=list)

def get_youtube_shorts(page: Page, request: YouTubeShortsRequest) -> YouTubeShortsResult:
    url = "https://www.youtube.com/hashtag/shorts"
    checkpoint("Navigate to YouTube Shorts")
    page.goto(url, wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(8000)
    result = YouTubeShortsResult()
    js_code = """(max) => {
        const results = [];
        const seen = new Set();
        const h3s = document.querySelectorAll('h3');
        for (const h3 of h3s) {
            if (results.length >= max) break;
            const title = h3.innerText.trim();
            if (!title || title.length < 5 || seen.has(title)) continue;
            if (title.match(/^(Subscribe|Sign|Menu|Search|Privacy|Cookie|YouTube|Filter|Sort)/i)) continue;
            seen.add(title);
            results.push({ title, channel: '', views: '', likes: '' });
        }
        return results;
    }"""
    for d in page.evaluate(js_code, request.max_results):
        item = ShortItem()
        item.title = d.get("title", "")
        item.channel = d.get("channel", "")
        item.views = d.get("views", "")
        result.shorts.append(item)
    print(f"Found {len(result.shorts)} shorts")
    return result

def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("youtube_shorts")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            get_youtube_shorts(page, YouTubeShortsRequest())
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)

if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
