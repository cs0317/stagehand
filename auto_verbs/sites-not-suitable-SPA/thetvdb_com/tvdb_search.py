"""Playwright script (Python) — TheTVDB"""
import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint

@dataclass(frozen=True)
class TVDBRequest:
    show: str = "Breaking Bad"

@dataclass
class TVDBResult:
    name: str = ""
    network: str = ""
    status: str = ""
    first_air_date: str = ""
    last_air_date: str = ""
    seasons: str = ""
    episodes: str = ""
    genre: str = ""
    rating: str = ""

def search_tvdb(page: Page, request: TVDBRequest) -> TVDBResult:
    url = f"https://thetvdb.com/search?query={request.show.replace(' ', '+')}"
    checkpoint("Navigate to TheTVDB search")
    page.goto(url, wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(5000)
    result = TVDBResult()
    js_code = """() => {
        const h3s = document.querySelectorAll('h3');
        for (const h3 of h3s) {
            const text = h3.innerText.trim();
            if (text && text.length > 2 && !text.match(/^(Search|Filter|Privacy|Cookie|Menu)/i)) {
                return { name: text };
            }
        }
        const link = document.querySelector('a[href*="/series/"]');
        if (link) return { name: link.innerText.trim() };
        return { name: '' };
    }"""
    data = page.evaluate(js_code)
    result.name = data.get("name", "")
    print(f"Found show: {result.name}")
    return result

def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("tvdb")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            search_tvdb(page, TVDBRequest())
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)

if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
