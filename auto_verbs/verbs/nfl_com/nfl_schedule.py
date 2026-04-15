"""
Auto-generated Playwright script (Python)
NFL - Team Schedule (via ESPN)
Team: Seattle Seahawks

Note: NFL.com schedule page is unavailable during offseason.
Uses ESPN schedule page as data source.

Generated on: 2026-04-15T21:45:44.853Z
Recorded 1 browser interactions
"""

import re
import os, sys, shutil
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws


RESULT_RE = re.compile(r'^([WLT])(\d+-\d+(?:\s+OT)?)\s+(\d+-\d+(?:-\d+)?)')
WEEK_DATE_RE = re.compile(r'^(\d+|DIV|CONF|SB|WC)\s+(.+)$')


def run(
    playwright: Playwright,
    team_slug: str = "sea",
    team: str = "Seattle Seahawks",
    max_games: int = 5,
) -> list:
    print(f"  Team: {team}\n")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("nfl_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    all_games = []

    try:
        url = f"https://www.espn.com/nfl/team/schedule/_/name/{team_slug}"
        print(f"Loading {url}...")
        page.goto(url, wait_until="domcontentloaded")
        page.wait_for_timeout(8000)
        print(f"  Loaded: {page.url}")

        text = page.evaluate("document.body ? document.body.innerText : ''") or ""
        text_lines = [l.strip() for l in text.split("\n") if l.strip()]

        # Parse game entries
        # Pattern: week+date line -> 'vs'/'@' -> opponent -> result line
        i = 0
        in_schedule = False
        current_section = ""
        post_games = []
        reg_games = []
        while i < len(text_lines):
            line = text_lines[i]

            if line in ('Postseason', 'Regular Season'):
                in_schedule = True
                current_section = line
                i += 2  # skip header row
                continue
            if line == 'Preseason':
                break

            if in_schedule:
                m = WEEK_DATE_RE.match(line)
                if m and line != 'BYE WEEK' and not line.startswith('WK'):
                    parts = m.group(0).split(None, 1)
                    week = parts[0]
                    date = parts[1] if len(parts) > 1 else ''
                    # Handle multi-word week (e.g., '8  BYE WEEK')
                    if 'BYE' in date:
                        i += 1
                        continue
                    home_away = text_lines[i + 1] if i + 1 < len(text_lines) else ''
                    opponent = text_lines[i + 2] if i + 2 < len(text_lines) else ''
                    result_line = text_lines[i + 3] if i + 3 < len(text_lines) else ''
                    rm = RESULT_RE.match(result_line)
                    if rm:
                        wl = rm.group(1)
                        score = rm.group(2)
                        record = rm.group(3)
                        prefix = 'vs' if home_away == 'vs' else '@'
                        game = {
                            'week': week,
                            'date': date,
                            'opponent': f'{prefix} {opponent}',
                            'result': f'{wl} {score}',
                            'record': record,
                        }
                        if current_section == 'Postseason':
                            post_games.append(game)
                        else:
                            reg_games.append(game)
                        i += 4
                        continue

            i += 1

        # Chronological order: regular season then postseason
        all_games = reg_games + post_games
        # Take last N games (most recent)
        results = all_games[-max_games:]

        print("=" * 60)
        print(f"{team} - Recent Games")
        print("=" * 60)
        for idx, g in enumerate(results, 1):
            print(f"\n{idx}. Week {g['week']}: {g['date']}")
            print(f"   Opponent: {g['opponent']}")
            print(f"   Result:   {g['result']}")
            print(f"   Record:   {g['record']}")

        print(f"\nShowing {len(results)} most recent games")

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