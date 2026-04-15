"""
Auto-generated Playwright script (Python)
Petfinder - Adoptable Pet Search
Animal type: dogs, Location: 90210

Generated on: 2026-04-15T21:52:39.570Z
Recorded 1 browser interactions
"""

import re
import os, sys, shutil
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws


MILES_RE = re.compile(r'^\d+ miles? away$')
AGE_GENDER_RE = re.compile(r'^(\w+)\s*[\u2022]\s*(\w+)$')


def run(
    playwright: Playwright,
    url: str = "https://www.petfinder.com/search/dogs-for-adoption/us/ca/beverly-hills-90210/",
    max_results: int = 5,
) -> list:
    print(f"  URL: {url}\n")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("petfinder_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        print(f"Loading {url}...")
        page.goto(url, wait_until="domcontentloaded")
        page.wait_for_timeout(8000)
        print(f"  Loaded: {page.url}")

        text = page.evaluate("document.body ? document.body.innerText : ''") or ""
        text_lines = [l.strip() for l in text.split("\n") if l.strip()]

        # Skip to 'pet results'
        i = 0
        while i < len(text_lines):
            if text_lines[i] == 'pet results':
                i += 1
                break
            i += 1

        while i < len(text_lines) and len(results) < max_results:
            line = text_lines[i]

            # Detect 'X miles away' → pet entry
            if MILES_RE.match(line):
                name = text_lines[i - 1] if i > 0 else 'Unknown'
                age_gender_line = text_lines[i + 1] if i + 1 < len(text_lines) else ''
                breed = text_lines[i + 2] if i + 2 < len(text_lines) else 'Unknown'

                # Parse age and gender from 'Adult • Male'
                ag = AGE_GENDER_RE.match(age_gender_line)
                age = ag.group(1) if ag else 'Unknown'
                gender = ag.group(2) if ag else 'Unknown'

                # Find shelter name
                shelter = 'Unknown'
                for j in range(i + 3, min(i + 20, len(text_lines))):
                    if text_lines[j] == 'Shelter':
                        shelter = text_lines[j + 1] if j + 1 < len(text_lines) else 'Unknown'
                        break

                results.append({
                    'name': name,
                    'breed': breed,
                    'age': age,
                    'gender': gender,
                    'shelter': shelter,
                })

            i += 1

        print("=" * 60)
        print("Adoptable Dogs near 90210")
        print("=" * 60)
        for idx, r in enumerate(results, 1):
            print(f"\n{idx}. {r['name']}")
            print(f"   Breed:   {r['breed']}")
            print(f"   Age:     {r['age']}")
            print(f"   Gender:  {r['gender']}")
            print(f"   Shelter: {r['shelter']}")

        print(f"\nFound {len(results)} pets")

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