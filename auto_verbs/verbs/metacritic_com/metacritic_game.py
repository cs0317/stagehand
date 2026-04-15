"""
Auto-generated Playwright script (Python)
Metacritic - Game Score Lookup
Game: Elden Ring

Generated on: 2026-04-15T21:30:31.483Z
Recorded 1 browser interactions
"""

import re
import os, sys, shutil
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws


SCORE_RE = re.compile(r'^\d+\.?\d*$')
REVIEWS_RE = re.compile(r'^Based on ([\d,]+) (Critic Reviews|User Ratings)$')


def run(
    playwright: Playwright,
    game_slug: str = "elden-ring",
    game_title: str = "Elden Ring",
) -> dict:
    print(f"  Game: {game_title}")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("metacritic_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    result = {}

    try:
        url = f"https://www.metacritic.com/game/{game_slug}/"
        print(f"Loading {url}...")
        page.goto(url, wait_until="domcontentloaded")
        page.wait_for_timeout(8000)
        print(f"  Loaded: {page.url}")

        text = page.evaluate("document.body ? document.body.innerText : ''") or ""
        text_lines = [l.strip() for l in text.split("\n") if l.strip()]

        metascore = None
        meta_label = None
        meta_reviews = None
        user_score = None
        user_label = None
        user_ratings = None
        release_date = None
        platform = None
        critic_summary = None

        i = 0
        found_main_meta = False
        while i < len(text_lines):
            line = text_lines[i]

            # Release date
            if line.startswith('Released On'):
                release_date = re.sub(r'^Released\s+On:?\s*', '', line)

            # Main METASCORE section (after game title)
            if line == "METASCORE" and not found_main_meta:
                found_main_meta = True
                # Next lines: label, 'Based on N Critic Reviews', score
                for j in range(i + 1, min(i + 5, len(text_lines))):
                    jline = text_lines[j]
                    m = REVIEWS_RE.match(jline)
                    if m and 'Critic' in m.group(2):
                        meta_reviews = m.group(1)
                    elif SCORE_RE.match(jline) and not metascore:
                        val = jline
                        if '.' not in val and int(val) <= 100:
                            metascore = val
                    elif jline in ('Universal Acclaim', 'Generally Favorable', 'Mixed or Average Reviews', 'Generally Unfavorable'):
                        meta_label = jline

            # USER SCORE section
            if line == "USER SCORE" and not user_score:
                for j in range(i + 1, min(i + 5, len(text_lines))):
                    jline = text_lines[j]
                    m = REVIEWS_RE.match(jline)
                    if m and 'User' in m.group(2):
                        user_ratings = m.group(1)
                    elif SCORE_RE.match(jline) and '.' in jline:
                        user_score = jline
                    elif jline in ('Generally Favorable', 'Mixed or Average Reviews', 'Generally Unfavorable', 'Universal Acclaim'):
                        user_label = jline

            # First platform mention in critic reviews
            if line in ('PLAYSTATION 5', 'PLAYSTATION 4', 'PC', 'XBOX SERIES X', 'XBOX ONE', 'NINTENDO SWITCH') and not platform:
                platform = line

            # First critic review summary (long text after a score)
            if not critic_summary and len(line) > 100 and i > 10:
                critic_summary = line

            i += 1

        print("=" * 60)
        print(f"Metacritic: {game_title}")
        print("=" * 60)
        print(f"\nRelease Date: {release_date or 'N/A'}")
        print(f"\nMetascore:    {metascore or 'N/A'} ({meta_label or 'N/A'})")
        print(f"  Based on:   {meta_reviews or 'N/A'} Critic Reviews")
        print(f"\nUser Score:   {user_score or 'N/A'} ({user_label or 'N/A'})")
        print(f"  Based on:   {user_ratings or 'N/A'} User Ratings")
        print(f"\nPlatform:     {platform or 'N/A'}")
        print(f"\nCritic Summary:")
        if critic_summary:
            print(f"  {critic_summary[:200]}...")
        else:
            print('  N/A')

        result = {
            "game": game_title,
            "release_date": release_date,
            "metascore": metascore,
            "meta_label": meta_label,
            "meta_reviews": meta_reviews,
            "user_score": user_score,
            "user_label": user_label,
            "user_ratings": user_ratings,
            "platform": platform,
            "critic_summary": critic_summary,
        }

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