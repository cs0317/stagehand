"""
Auto-generated Playwright script (Python)
Grants.gov - Grant Search
Query: STEM education

Generated on: 2026-04-15T21:15:27.465Z
Recorded 1 browser interactions
"""

import re
import os, sys, shutil
from urllib.parse import quote_plus
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws


# Grant entry markers
DATE_RE = re.compile(r'^(?:TBD|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4})$')
STATUS_VALS = {'Open', 'Forecasted', 'Closed', 'Archived'}


def run(
    playwright: Playwright,
    query: str = "STEM education",
    max_results: int = 5,
) -> list:
    print(f"  Query: {query}")
    print(f"  Max results: {max_results}\n")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("grants_gov")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        url = f"https://simpler.grants.gov/search?query={quote_plus(query)}"
        print(f"Loading {url}...")
        page.goto(url)
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(8000)
        print(f"  Loaded: {page.url}")

        text = page.evaluate("document.body ? document.body.innerText : ''") or ""
        text_lines = [l.strip() for l in text.split("\n") if l.strip()]

        # Parse grant entries from text
        # Pattern: close_date, status, title, number, agency, posted_date, expected_awards, award_min, award_max
        i = 0
        while i < len(text_lines) and len(results) < max_results:
            line = text_lines[i]
            # Look for a date line followed by a status
            if DATE_RE.match(line) and i + 1 < len(text_lines) and text_lines[i + 1] in STATUS_VALS:
                close_date = line
                status = text_lines[i + 1]
                title = text_lines[i + 2] if i + 2 < len(text_lines) else ""
                # Skip 'Number:' line
                agency = ""
                award_min = ""
                award_max = ""
                # Look ahead for agency and funding
                for j in range(i + 3, min(i + 10, len(text_lines))):
                    jline = text_lines[j]
                    if jline.startswith("Number:"):
                        continue
                    if jline.startswith("Posted date:"):
                        continue
                    if jline.startswith("Expected awards:"):
                        continue
                    if jline.startswith("$"):
                        if not award_min:
                            award_min = jline
                        else:
                            award_max = jline
                            break
                    elif not agency and not jline.startswith("$") and DATE_RE.match(jline) is None and jline not in STATUS_VALS:
                        agency = jline

                funding = award_min + " - " + award_max if award_min and award_max else award_min or "N/A"
                results.append({
                    "title": title,
                    "agency": agency,
                    "funding": funding,
                    "close_date": close_date,
                })
                i += 8  # skip past this entry
            else:
                i += 1

        print("=" * 70)
        print(f"Grants.gov Search: {query}")
        print("=" * 70)
        for idx, r in enumerate(results, 1):
            print(f"\n{idx}. {r['title']}")
            print(f"   Agency:     {r['agency']}")
            print(f"   Funding:    {r['funding']}")
            print(f"   Close Date: {r['close_date']}")

        print(f"\nFound {len(results)} grants")

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