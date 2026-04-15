"""
Auto-generated Playwright script (Python)
Rotten Tomatoes - TV Show Lookup
Show: Severance

Generated on: 2026-04-15T22:14:29.729Z
Recorded 1 browser interactions
"""

import re
import os, sys, shutil
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws


SEASONS_RE = re.compile(r'(\d+) Seasons?')
SCORE_RE = re.compile(r'^(\d+)%$')


def run(
    playwright: Playwright,
    slug: str = "severance",
    show: str = "Severance",
) -> dict:
    print(f"  Show: {show}\n")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("rottentomatoes_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    result = {}

    try:
        url = f"https://www.rottentomatoes.com/tv/{slug}"
        print(f"Loading {url}...")
        page.goto(url, wait_until="domcontentloaded")
        page.wait_for_timeout(8000)
        print(f"  Loaded: {page.url}")

        text = page.evaluate("document.body ? document.body.innerText : ''") or ""
        text_lines = [l.strip() for l in text.split("\n") if l.strip()]

        tomatometer = 'N/A'
        audience_score = 'N/A'
        seasons = 'N/A'
        synopsis = 'N/A'

        for i, line in enumerate(text_lines):
            # Tomatometer
            if 'Tomatometer' in line and i > 0:
                sm = SCORE_RE.match(text_lines[i - 1])
                if sm:
                    tomatometer = sm.group(1) + '%'

            # Audience score (Popcornmeter)
            if 'Popcornmeter' in line and i > 0:
                sm = SCORE_RE.match(text_lines[i - 1])
                if sm:
                    audience_score = sm.group(1) + '%'

            # Seasons from info line
            sm = SEASONS_RE.search(line)
            if sm:
                seasons = sm.group(1)

            # Synopsis
            if line == 'Synopsis' and i + 1 < len(text_lines):
                synopsis = text_lines[i + 1]

        result = {
            'show': show,
            'tomatometer': tomatometer,
            'audience_score': audience_score,
            'seasons': seasons,
            'synopsis': synopsis,
        }

        print("=" * 60)
        print(f"{show} - Rotten Tomatoes")
        print("=" * 60)
        print(f"Tomatometer:    {tomatometer}")
        print(f"Audience Score: {audience_score}")
        print(f"Seasons:        {seasons}")
        print(f"\nSynopsis:\n{synopsis}")

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        browser.close()
        chrome_proc.terminate()
        shutil.rmtree(profile_dir, ignore_errors=True)

    return result


if __name__ == "__main__":
    with sync_playwright() as pw:
        run(pw)