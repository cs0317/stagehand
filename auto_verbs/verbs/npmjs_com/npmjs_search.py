"""
Auto-generated Playwright script (Python)
npm - Package Search
Query: state management

Generated on: 2026-04-15T21:50:31.651Z
Recorded 1 browser interactions
"""

import re
import os, sys, shutil
from urllib.parse import quote_plus
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws


VERSION_RE = re.compile(r'^\u2022 ([\d.]+) \u2022')
DOWNLOADS_RE = re.compile(r'^[\d,]+$')


def run(
    playwright: Playwright,
    query: str = "state management",
    max_results: int = 5,
) -> list:
    print(f"  Query: {query}\n")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("npmjs_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        url = f"https://www.npmjs.com/search?q={quote_plus(query)}"
        print(f"Loading {url}...")
        page.goto(url, wait_until="domcontentloaded")
        page.wait_for_timeout(8000)
        print(f"  Loaded: {page.url}")

        text = page.evaluate("document.body ? document.body.innerText : ''") or ""
        text_lines = [l.strip() for l in text.split("\n") if l.strip()]

        # Parse packages - each package ends with a downloads count
        # Working backwards from downloads count to find version and name
        i = 0
        # Skip to 'Search results'
        while i < len(text_lines):
            if "packages found" in text_lines[i]:
                i += 1
                break
            i += 1

        # Skip 'Sort by' line
        if i < len(text_lines) and text_lines[i].startswith('Sort'):
            i += 1

        current_name = None
        current_desc = None
        current_version = None

        while i < len(text_lines) and len(results) < max_results:
            line = text_lines[i]

            # Downloads count (end of a package entry)
            if DOWNLOADS_RE.match(line) and current_name:
                downloads = line
                results.append({
                    'name': current_name,
                    'description': current_desc or 'N/A',
                    'version': current_version or 'N/A',
                    'downloads': downloads,
                })
                current_name = None
                current_desc = None
                current_version = None
                i += 1
                continue

            # Version line
            vm = VERSION_RE.match(line)
            if vm:
                current_version = vm.group(1)
                i += 1
                # Skip duplicate version line
                if i < len(text_lines) and text_lines[i].startswith('published'):
                    i += 1
                continue

            # Package name (appears right after previous downloads or at start)
            if current_name is None:
                current_name = line
                current_desc = text_lines[i + 1] if i + 1 < len(text_lines) else None

            i += 1

        print("=" * 60)
        print(f"npm Search: {query}")
        print("=" * 60)
        for idx, r in enumerate(results, 1):
            print(f"\n{idx}. {r['name']} (v{r['version']})")
            print(f"   {r['description']}")
            print(f"   Weekly downloads: {r['downloads']}")

        print(f"\nFound {len(results)} packages")

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