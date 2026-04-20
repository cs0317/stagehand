"""Playwright script (Python) — Tunefind"""
import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint

@dataclass(frozen=True)
class TunefindRequest:
    show: str = "stranger-things"
    max_results: int = 5

@dataclass
class SongItem:
    title: str = ""
    artist: str = ""
    episode: str = ""
    scene: str = ""

@dataclass
class TunefindResult:
    songs: List[SongItem] = field(default_factory=list)

def search_tunefind(page: Page, request: TunefindRequest) -> TunefindResult:
    url = f"https://www.tunefind.com/show/{request.show}"
    checkpoint("Navigate to Tunefind")
    page.goto(url, wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(5000)
    result = TunefindResult()
    js_code = """(max) => {
        const results = [];
        const items = document.querySelectorAll('[class*="SongRow"], [class*="song"], tr');
        for (const item of items) {
            if (results.length >= max) break;
            const titleEl = item.querySelector('[class*="title"], td:first-child a');
            const title = titleEl ? titleEl.textContent.trim() : '';
            if (!title) continue;
            const artistEl = item.querySelector('[class*="artist"], td:nth-child(2) a');
            const artist = artistEl ? artistEl.textContent.trim() : '';
            results.push({ title, artist, episode: '', scene: '' });
        }
        return results;
    }"""
    for d in page.evaluate(js_code, request.max_results):
        item = SongItem()
        item.title = d.get("title", "")
        item.artist = d.get("artist", "")
        result.songs.append(item)
    print(f"Found {len(result.songs)} songs")
    return result

def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("tunefind")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            search_tunefind(page, TunefindRequest())
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)

if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
