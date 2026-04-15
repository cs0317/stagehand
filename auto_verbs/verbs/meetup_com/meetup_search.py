"""
Auto-generated Playwright script (Python)
Meetup - Group Search
Query: hiking near Denver, CO

Generated on: 2026-04-15T21:28:20.107Z
Recorded 1 browser interactions
"""

import re
import os, sys, shutil
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws


MEMBERS_RE = re.compile(r'^([\d,]+)\s+members$')
RATING_RE = re.compile(r'^\d+\.\d$')


def run(
    playwright: Playwright,
    query: str = "hiking",
    location: str = "us--co--Denver",
    location_label: str = "Denver, CO",
    max_results: int = 5,
) -> list:
    print(f"  Query: {query}")
    print(f"  Location: {location_label}\n")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("meetup_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        from urllib.parse import quote_plus
        url = f"https://www.meetup.com/find/?keywords={quote_plus(query)}&location={location}&source=GROUPS&eventType=group"
        print(f"Loading {url}...")
        page.goto(url)
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(10000)
        print(f"  Loaded: {page.url}")

        text = page.evaluate("document.body ? document.body.innerText : ''") or ""
        text_lines = [l.strip() for l in text.split("\n") if l.strip()]

        # Parse group listings
        # Pattern: location -> optional rating -> group name -> description -> 'N members'
        i = 0
        # Skip to after the category filters (after 'Movements & Politics')
        while i < len(text_lines):
            if text_lines[i] == "Movements & Politics":
                i += 1
                break
            i += 1

        # Now parse groups
        while i < len(text_lines) and len(results) < max_results:
            line = text_lines[i]

            # Look for members line
            m = MEMBERS_RE.match(line)
            if m:
                members = m.group(1)
                # Look backwards for group name, rating, location
                name = None
                rating = None
                loc = None
                desc = None

                # Line before members is description
                if i >= 2:
                    desc = text_lines[i - 1]
                    # Line before desc is name
                    j = i - 2
                    name = text_lines[j]

                    # Look further back for rating and location
                    for k in range(j - 1, max(j - 5, 0), -1):
                        kline = text_lines[k]
                        if RATING_RE.match(kline):
                            rating = kline
                        elif re.match(r'^[A-Z][a-z]+.*,\s*[A-Z]{2}$', kline):
                            loc = kline
                            break

                if name and name not in ('New group', 'Report Ad'):
                    results.append({
                        'name': name,
                        'members': members,
                        'rating': rating or 'N/A',
                        'location': loc or 'N/A',
                    })
            i += 1

        print("=" * 60)
        print(f"Meetup Groups: {query} near {location_label}")
        print("=" * 60)
        for idx, r in enumerate(results, 1):
            print(f"\n{idx}. {r['name']}")
            print(f"   Members:  {r['members']}")
            print(f"   Rating:   {r['rating']}")
            print(f"   Location: {r['location']}")

        print(f"\nFound {len(results)} groups")

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