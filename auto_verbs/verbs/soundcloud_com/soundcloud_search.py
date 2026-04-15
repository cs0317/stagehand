"""
Playwright script (Python) — SoundCloud Track Search
Search for tracks by keyword.
Extract track title, artist, duration, and play count.

URL pattern: https://soundcloud.com/search/sounds?q={query}
"""

import re
import os
import sys
import shutil
from urllib.parse import quote
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws


PLAYS_RE = re.compile(r"^([\d,]+)\s+plays?$")


def run(
    playwright: Playwright,
    query: str = "lo-fi hip hop",
    max_results: int = 5,
) -> list:
    print(f"  Query: {query}")
    print(f"  Max results: {max_results}\n")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("soundcloud_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        search_url = f"https://soundcloud.com/search/sounds?q={quote(query)}"
        print(f"Loading {search_url}...")
        page.goto(search_url, wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(8000)
        print(f"  Loaded: {page.url}")

        # Accept cookie banner if present
        try:
            accept = page.locator('button#onetrust-accept-btn-handler')
            if accept.is_visible(timeout=2000):
                accept.click()
                page.wait_for_timeout(1000)
        except Exception:
            pass

        body = page.locator("body").inner_text(timeout=10000)
        lines = [l.strip() for l in body.split("\n") if l.strip()]

        print(f"\nParsing {len(lines)} body lines...")

        # Find "Found N+ tracks" header
        start_idx = 0
        for i, l in enumerate(lines):
            if "Found" in l and "track" in l:
                start_idx = i + 1
                print(f"  Results start at line {i}: {l}")
                break

        # Pattern per track block:
        #   [artist_or_genre]  (e.g. "Hip Hop" or "nigeldelviero")
        #   [title]            (e.g. "Lofi Hip Hop - LoFi.Zebraw - Sijang")
        #   "Posted X ago"
        #   "X ago"
        #   [tag/genre]
        #   [likes count]
        #   [reposts count]
        #   "N plays"  <-- this is our anchor
        #   [abbreviated]
        #   "View all comments"
        #   [comment count]

        i = start_idx
        while i < len(lines) and len(results) < max_results:
            m = PLAYS_RE.match(lines[i])
            if m:
                plays = m.group(1)

                # Walk backwards to find title and artist
                # plays line is typically at offset +6 from artist line
                # Pattern: artist(-2 before "Posted") -> title(-1 before "Posted") -> "Posted X ago" -> ...
                title = "N/A"
                artist = "N/A"

                # Find "Posted" line above plays
                posted_idx = None
                for delta in range(1, 8):
                    idx = i - delta
                    if idx >= start_idx and lines[idx].startswith("Posted "):
                        posted_idx = idx
                        break

                if posted_idx is not None:
                    # Title is right before "Posted"
                    if posted_idx - 1 >= start_idx:
                        title = lines[posted_idx - 1]
                    # Artist is before title
                    if posted_idx - 2 >= start_idx:
                        artist = lines[posted_idx - 2]

                # Duration not available in search results
                duration = "N/A"

                if title != "N/A":
                    results.append({
                        "title": title,
                        "artist": artist,
                        "duration": duration,
                        "plays": plays,
                    })

                i += 1
                continue
            i += 1

        print(f'\nFound {len(results)} tracks for "{query}":\n')
        for idx, t in enumerate(results, 1):
            print(f"  {idx}. {t['title']}")
            print(f"     Artist: {t['artist']}")
            print(f"     Duration: {t['duration']}  Plays: {t['plays']}")
            print()

    except Exception as e:
        import traceback

        print(f"Error: {e}")
        traceback.print_exc()
    finally:
        try:
            browser.close()
        except Exception:
            pass
        chrome_proc.terminate()
        shutil.rmtree(profile_dir, ignore_errors=True)

    return results


if __name__ == "__main__":
    with sync_playwright() as playwright:
        items = run(playwright)
        print(f"\nTotal tracks found: {len(items)}")
