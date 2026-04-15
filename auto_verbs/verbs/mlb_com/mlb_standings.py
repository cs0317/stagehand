"""
Auto-generated Playwright script (Python)
MLB - American League Standings

Generated on: 2026-04-15T21:34:40.275Z
Recorded 1 browser interactions
"""

import re
import os, sys, shutil
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws


AL_TEAMS = {
    "Tampa Bay Rays", "New York Yankees", "Baltimore Orioles", "Toronto Blue Jays", "Boston Red Sox",
    "Minnesota Twins", "Cleveland Guardians", "Detroit Tigers", "Kansas City Royals", "Chicago White Sox",
    "Texas Rangers", "Houston Astros", "Seattle Mariners", "Los Angeles Angels", "Oakland Athletics",
    "Athletics",
}
STAT_RE = re.compile(r'^(\d+)\s+(\d+)\s+\.\d+\s+(\S+)')


def run(
    playwright: Playwright,
    max_teams: int = 5,
) -> list:
    print("  American League Top " + str(max_teams) + " Teams\n")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("mlb_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        url = "https://www.mlb.com/standings"
        print(f"Loading {url}...")
        page.goto(url, wait_until="domcontentloaded")
        page.wait_for_timeout(10000)
        print(f"  Loaded: {page.url}")

        text = page.evaluate("document.body ? document.body.innerText : ''") or ""
        text_lines = [l.strip() for l in text.split("\n") if l.strip()]

        all_al = []
        i = 0
        while i < len(text_lines) - 1:
            line = text_lines[i]
            if line in AL_TEAMS:
                # Next non-empty line should have stats: W L PCT GB ...
                stat_line = text_lines[i + 1]
                m = STAT_RE.match(stat_line)
                if m:
                    wins = int(m.group(1))
                    losses = int(m.group(2))
                    gb = m.group(3)
                    all_al.append({'name': line, 'wins': wins, 'losses': losses, 'gb': gb})
            i += 1

        # Sort by wins descending, then losses ascending
        all_al.sort(key=lambda t: (-t['wins'], t['losses']))
        results = all_al[:max_teams]

        # Recalculate GB from top team
        if results:
            top_w, top_l = results[0]['wins'], results[0]['losses']
            for r in results:
                diff = ((top_w - r['wins']) + (r['losses'] - top_l)) / 2
                r['gb'] = '-' if diff == 0 else str(diff)

        print("=" * 60)
        print("MLB American League Standings (Top " + str(max_teams) + ")")
        print("=" * 60)
        print(f"{'Team':<25} {'W':>3} {'L':>3} {'GB':>5}")
        print('-' * 40)
        for idx, r in enumerate(results, 1):
            label = str(idx) + '. ' + r['name']
            print(f"{label:<25} {r['wins']:>3} {r['losses']:>3} {r['gb']:>5}")

        print(f"\nTotal AL teams found: {len(all_al)}")

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        browser.close()
        chrome_proc.terminate()
        shutil.rmtree(profile_dir, ignore_errors=True)

    return results


if __name__ == "__main__":
    with sync_playwright() as pw:
        run(pw)