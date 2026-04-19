"""
Spotify – Browse new music releases on Spotify's web player

Uses CDP-launched Chrome to avoid bot detection.
"""

import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class SpotifyNewReleasesSearchRequest:
    max_results: int = 10


@dataclass
class SpotifyReleaseItem:
    album_title: str = ""
    artist_name: str = ""
    release_date: str = ""
    album_type: str = ""
    num_tracks: str = ""


@dataclass
class SpotifyNewReleasesSearchResult:
    items: List[SpotifyReleaseItem] = field(default_factory=list)


# Browse new music releases on Spotify's web player.
def spotify_new_releases_search(page: Page, request: SpotifyNewReleasesSearchRequest) -> SpotifyNewReleasesSearchResult:
    """Browse new music releases on Spotify."""
    print(f"  Max results: {request.max_results}\n")

    url = "https://open.spotify.com/genre/new-releases"
    print(f"Loading {url}...")
    checkpoint("Navigate to Spotify new releases")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(6000)

    result = SpotifyNewReleasesSearchResult()

    checkpoint("Extract new release listings")
    js_code = """(max) => {
        const cards = document.querySelectorAll('[class*="Card"], [class*="card"], [data-testid*="card"], article, [class*="album"], section [class*="item"]');
        const items = [];
        for (const card of cards) {
            if (items.length >= max) break;
            const titleEl = card.querySelector('[class*="title"], [class*="Title"], a[title], [data-testid*="title"]');
            const artistEl = card.querySelector('[class*="subtitle"], [class*="artist"], [class*="Artist"], [data-testid*="subtitle"]');
            const dateEl = card.querySelector('[class*="date"], [class*="Date"], time');
            const typeEl = card.querySelector('[class*="type"], [class*="Type"], [class*="label"]');
            const tracksEl = card.querySelector('[class*="track"], [class*="Track"]');

            const album_title = titleEl ? (titleEl.title || titleEl.textContent.trim()) : '';
            const artist_name = artistEl ? artistEl.textContent.trim() : '';
            const release_date = dateEl ? (dateEl.getAttribute('datetime') || dateEl.textContent.trim()) : '';
            const album_type = typeEl ? typeEl.textContent.trim() : '';
            const num_tracks = tracksEl ? tracksEl.textContent.trim() : '';

            if (album_title) {
                items.push({album_title, artist_name, release_date, album_type, num_tracks});
            }
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = SpotifyReleaseItem()
        item.album_title = d.get("album_title", "")
        item.artist_name = d.get("artist_name", "")
        item.release_date = d.get("release_date", "")
        item.album_type = d.get("album_type", "")
        item.num_tracks = d.get("num_tracks", "")
        result.items.append(item)

    for i, item in enumerate(result.items, 1):
        print(f"\n  Release {i}:")
        print(f"    Album:    {item.album_title}")
        print(f"    Artist:   {item.artist_name}")
        print(f"    Date:     {item.release_date}")
        print(f"    Type:     {item.album_type}")
        print(f"    Tracks:   {item.num_tracks}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("spotify")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            request = SpotifyNewReleasesSearchRequest()
            result = spotify_new_releases_search(page, request)
            print("\n=== DONE ===")
            print(f"Found {len(result.items)} new releases")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
