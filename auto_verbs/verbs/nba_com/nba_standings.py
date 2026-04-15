"""
Auto-generated Playwright script (Python)
NBA - Eastern Conference Standings

Generated on: 2026-04-15T21:37:13.323Z
Recorded 1 browser interactions
"""

import re
import os, sys, shutil
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws


STAT_RE = re.compile(r'^(\d+)\s+(\d+)\s+\.(\d+)\s+(\S+)')


def run(
    playwright: Playwright,
    conference: str = "Eastern",
    max_teams: int = 5,
) -> list:
    print(f"  {conference} Conference Top {max_teams} Teams\n")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("nba_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        url = "https://www.nba.com/standings"
        print(f"Loading {url}...")
        page.goto(url, wait_until="domcontentloaded")
        page.wait_for_timeout(10000)
        print(f"  Loaded: {page.url}")

        text = page.evaluate("document.body ? document.body.innerText : ''") or ""
        text_lines = [l.strip() for l in text.split("\n") if l.strip()]

        # Find the conference section
        conf_header = conference + ' Conference'
        i = 0
        in_conf = False
        while i < len(text_lines) and len(results) < max_teams:
            line = text_lines[i]

            if line == conf_header:
                in_conf = True
                i += 1
                continue

            # Stop at next conference
            if in_conf and 'Conference' in line and line != conf_header and 'TEAM' not in line:
                break

            if in_conf:
                # Look for rank number (1-15)
                if re.match(r'^\d{1,2}$', line):
                    rank = int(line)
                    # Next lines: city, team_name, marker, stats
                    city = text_lines[i + 1] if i + 1 < len(text_lines) else ''
                    team = text_lines[i + 2] if i + 2 < len(text_lines) else ''
                    # Find stats line (starts with digits: W L)
                    for j in range(i + 3, min(i + 6, len(text_lines))):
                        m = STAT_RE.match(text_lines[j])
                        if m:
                            wins = int(m.group(1))
                            losses = int(m.group(2))
                            pct = '.' + m.group(3)
                            gb = m.group(4)
                            full_name = city + ' ' + team
                            results.append({
                                'rank': rank,
                                'name': full_name,
                                'wins': wins,
                                'losses': losses,
                                'pct': pct,
                                'gb': gb,
                            })
                            break

            i += 1

        print("=" * 60)
        print(f"NBA {conference} Conference Standings (Top {max_teams})")
        print("=" * 60)
        print(f"{'Team':<28} {'W':>3} {'L':>3} {'PCT':>5} {'GB':>4}")
        print('-' * 48)
        for r in results:
            label = str(r['rank']) + '. ' + r['name']
            print(f"{label:<28} {r['wins']:>3} {r['losses']:>3} {r['pct']:>5} {r['gb']:>4}")

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