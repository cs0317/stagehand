"""
Playwright script (Python) — Skillshare Class Search
Search for classes by keyword.
Extract class title, teacher name, duration, and number of students.

URL pattern: https://www.skillshare.com/en/search?query={query}
"""

import re
import os
import sys
import shutil
from urllib.parse import quote_plus
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws


DURATION_RE = re.compile(r"^(\d+h\s*)?\d+m$")
STUDENTS_RE = re.compile(r"^[\d,.]+k?$", re.IGNORECASE)
LEVEL_KEYWORDS = {"Any level", "Beginner", "Intermediate", "Advanced"}


def run(
    playwright: Playwright,
    query: str = "illustration",
    max_results: int = 5,
) -> list:
    print(f"  Query: {query}")
    print(f"  Max results: {max_results}\n")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("skillshare_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        search_url = f"https://www.skillshare.com/en/search?query={quote_plus(query)}"
        print(f"Loading {search_url}...")

        # Navigate with retry on crash
        for attempt in range(3):
            try:
                if attempt > 0:
                    page = context.new_page()
                page.goto(search_url, wait_until="domcontentloaded", timeout=30000)
                break
            except Exception as nav_err:
                if "crashed" in str(nav_err).lower() and attempt < 2:
                    print(f"  Page crashed, retrying (attempt {attempt + 2})...")
                    page.wait_for_timeout(2000)
                else:
                    raise
        page.wait_for_timeout(6000)
        print(f"  Loaded: {page.url}")

        body = page.locator("body").inner_text(timeout=10000)
        lines = [l.strip() for l in body.split("\n") if l.strip()]

        print(f"\nParsing {len(lines)} body lines...")

        # Find "Classes" section start — look for "(N Results)" after "Classes"
        start_idx = 0
        for i, l in enumerate(lines):
            if re.match(r"^\(\d[\d,.]*\s+Results?\)$", l):
                start_idx = i + 1
                print(f"  Classes section starts at line {i}: {l}")
                break

        # Find end of classes section — "Learning Paths" or "Digital Products"
        end_idx = len(lines)
        for i in range(start_idx, len(lines)):
            if lines[i] in ("Learning Paths", "Digital Products", "Shop Digital Products"):
                end_idx = i
                break

        # Parse class blocks using duration line as anchor
        # Pattern: ... teacher → [rating] → [(reviews)] → title → tags... → level → students → duration
        i = start_idx
        while i < end_idx and len(results) < max_results:
            if DURATION_RE.match(lines[i]):
                duration = lines[i]

                # Students is right before duration
                students = "N/A"
                if i - 1 >= start_idx and STUDENTS_RE.match(lines[i - 1]):
                    students = lines[i - 1]

                # Level is before students
                level_idx = i - 2
                if level_idx >= start_idx and lines[level_idx] in LEVEL_KEYWORDS:
                    pass  # valid level
                else:
                    level_idx = i - 2  # skip anyway

                # Walk backwards past tags/level to find title
                # Title is the first long line (not a tag, not a rating, not a review count)
                title = "N/A"
                teacher = "N/A"
                j = level_idx - 1 if level_idx >= start_idx else i - 3

                # Skip tag lines (short, often "+N" or single words like "Procreate")
                while j >= start_idx:
                    line = lines[j]
                    if re.match(r"^\+\d+$", line):
                        j -= 1
                        continue
                    if len(line) <= 25 and not re.match(r"^\d", line) and line not in LEVEL_KEYWORDS:
                        # Likely a tag
                        j -= 1
                        continue
                    break

                # This should be the title
                if j >= start_idx:
                    title = lines[j]
                    j -= 1

                # Skip optional review count "(N)" and rating "4.8"
                while j >= start_idx:
                    line = lines[j]
                    if re.match(r"^\([\d,.k]+\)$", line, re.IGNORECASE):
                        j -= 1
                        continue
                    if re.match(r"^\d(\.\d)?$", line):
                        j -= 1
                        continue
                    if line == "New":
                        j -= 1
                        continue
                    break

                # This should be the teacher
                if j >= start_idx:
                    candidate = lines[j]
                    # Skip "View all..." lines
                    if not candidate.startswith("View all") and not candidate.startswith("Learn "):
                        teacher = candidate

                if title != "N/A":
                    results.append({
                        "title": title,
                        "teacher": teacher,
                        "duration": duration,
                        "students": students,
                    })

                i += 1
                continue
            i += 1

        print(f'\nFound {len(results)} classes for "{query}":\n')
        for idx, c in enumerate(results, 1):
            print(f"  {idx}. {c['title']}")
            print(f"     Teacher: {c['teacher']}")
            print(f"     Duration: {c['duration']}  Students: {c['students']}")
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
        print(f"\nTotal classes found: {len(items)}")
