"""
Auto-generated Playwright script (Python)
Codecademy – Course Search
Query: Python   Max results: 5

Generated on: 2026-04-15T20:36:22.632Z
"""

import re
import os, sys, shutil
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws


def run(
    playwright: Playwright,
    query: str = "Python",
    max_results: int = 5,
) -> list:
    print(f"  Query: {query}  Max results: {max_results}\n")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("codecademy_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        # ── Navigate ──────────────────────────────────────────────────
        print("Loading Codecademy search results...")
        search_url = "https://www.codecademy.com/search?query=" + query.replace(" ", "+")
        page.goto(search_url)
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(8000)
        print(f"  Loaded: {page.url}")

        # ── Extract courses ───────────────────────────────────────────
        print(f"Extracting up to {max_results} courses...")

        body_text = page.evaluate("document.body.innerText") or ""
        lines = [l.strip() for l in body_text.split("\n") if l.strip()]

        # Pattern: "Course"/"Skill path" → Title → Description → Level → Duration
        TYPE_MARKERS = {"Course", "Skill path", "Career path", "Certification path"}
        FILTER_KEYWORDS = {"Level", "Beginner", "Intermediate", "Advanced", "Price",
                           "Free", "Paid", "Type", "Average time to complete", "All",
                           "Less than 5 hours", "5-10 hours", "10-20 hours",
                           "20-60 hours", "60+ hours", "View plans", "Clear filters",
                           "Filters", "Most relevant"}

        # Skip to actual results — find first TYPE_MARKER whose next line is a real title
        i = 0
        while i < len(lines) and len(results) < max_results:
            if lines[i] in TYPE_MARKERS and i + 1 < len(lines):
                title = lines[i + 1]
                # Validate: title should NOT be a type marker or filter keyword
                if title in TYPE_MARKERS or title in FILTER_KEYWORDS:
                    i += 1
                    continue

                course_type = lines[i]
                level = "N/A"
                duration = "N/A"

                for k in range(i + 2, min(i + 12, len(lines))):
                    line = lines[k]
                    if line in TYPE_MARKERS:
                        break
                    if "Beginner" in line and "." not in line:
                        level = "Beginner"
                    elif "Intermediate" in line and "." not in line:
                        level = "Intermediate"
                    elif "Advanced" in line and "." not in line:
                        level = "Advanced"
                    elif re.match(r"^(<\s*\d+|\d+)\s+hours?$", line) or line == "< 1 hour":
                        duration = line

                results.append({
                    "title": title,
                    "type": course_type,
                    "level": level,
                    "duration": duration,
                })

            i += 1

        # ── Print results ─────────────────────────────────────────────
        print(f"\nFound {len(results)} courses:\n")
        for i, course in enumerate(results, 1):
            print(f"  {i}. {course['title']} ({course['type']})")
            print(f"     Level: {course['level']}  Duration: {course['duration']}")
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
        print(f"\nTotal courses found: {len(items)}")
