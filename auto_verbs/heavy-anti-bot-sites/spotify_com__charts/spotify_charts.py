"""Playwright script (Python) — Spotify Charts"""
import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint

@dataclass(frozen=True)
class SpotifyChartsRequest:
    country: str = "us"
    max_results: int = 10

@dataclass
class SongItem:
    rank: str = ""
    title: str = ""
    artist: str = ""
    peak: str = ""
    weeks: str = ""

@dataclass
class SpotifyChartsResult:
    songs: List[SongItem] = field(default_factory=list)

def get_spotify_charts(page: Page, request: SpotifyChartsRequest) -> SpotifyChartsResult:
    url = f"https://charts.spotify.com/charts/view/regional-{request.country}-weekly/latest"
    checkpoint("Navigate to Spotify Charts")
    page.goto(url, wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(8000)
    result = SpotifyChartsResult()
    js_code = """(max) => {
        const results = [];
        const rows = document.querySelectorAll('tr, [class*="ChartEntry"], [class*="chart-entry"]');
        for (const row of rows) {
            if (results.length >= max) break;
            const cells = row.querySelectorAll('td');
            if (cells.length < 2) continue;
            const rank = cells[0] ? cells[0].textContent.trim() : '';
            const titleEl = row.querySelector('[class*="title"], [class*="TrackName"]');
            const title = titleEl ? titleEl.textContent.trim() : '';
            if (!title) continue;
            const artistEl = row.querySelector('[class*="artist"], [class*="ArtistName"]');
            const artist = artistEl ? artistEl.textContent.trim() : '';
            results.push({ rank, title, artist, peak: '', weeks: '' });
        }
        return results;
    }"""
    for d in page.evaluate(js_code, request.max_results):
        item = SongItem()
        item.rank = d.get("rank", "")
        item.title = d.get("title", "")
        item.artist = d.get("artist", "")
        result.songs.append(item)
    print(f"Found {len(result.songs)} songs")
    return result

def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("spotify_charts")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            get_spotify_charts(page, SpotifyChartsRequest())
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)

if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
