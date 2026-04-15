"""
Auto-generated Playwright script (Python)
PyPI - Package Search
Query: web scraping

Generated on: 2026-04-15T22:00:30.938Z
Recorded 1 browser interactions
"""

import re
import os, sys, shutil
from urllib.parse import quote_plus
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws


DATE_RE = re.compile(r'^(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d+, \d{4}$')


def run(
    playwright: Playwright,
    query: str = "web scraping",
    max_results: int = 5,
) -> list:
    print(f"  Query: {query}\n")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("pypi_org")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        url = f"https://pypi.org/search/?q={quote_plus(query)}"
        print(f"Loading {url}...")
        page.set_viewport_size({"width": 1920, "height": 1080})
        page.goto(url, wait_until="networkidle")
        page.wait_for_timeout(8000)
        print(f"  Loaded: {page.url}")

        text = page.evaluate("document.body ? document.body.innerText : ''") or ""
        text_lines = [l.strip() for l in text.split("\n") if l.strip()]

        # Note: PyPI search may show CAPTCHA for fresh CDP Chrome profiles.
        # Check if we hit a CAPTCHA
        if any('CAPTCHA' in l or 'characters seen in the image' in l for l in text_lines):
            print("  WARNING: CAPTCHA detected. PyPI search blocks fresh CDP profiles.")
            print("  The JS/Stagehand version works correctly.")

        # Skip to search results
        i = 0
        while i < len(text_lines):
            if text_lines[i] == 'Search results':
                i += 1
                break
            i += 1

        # Skip count line and sort options
        while i < len(text_lines):
            if text_lines[i] in ('Relevance', 'Date last updated'):
                i += 1
                break
            i += 1

        # Parse packages: name, date, description
        packages = []
        while i < len(text_lines) and len(packages) < max_results:
            name = text_lines[i]
            if name == 'Previous' or name.isdigit():
                break
            date = text_lines[i + 1] if i + 1 < len(text_lines) else 'N/A'
            desc = text_lines[i + 2] if i + 2 < len(text_lines) else 'N/A'
            if DATE_RE.match(date):
                packages.append({'name': name, 'description': desc, 'date': date})
                i += 3
            else:
                i += 1

        # Fetch version from PyPI JSON API
        for pkg in packages:
            try:
                api_url = f"https://pypi.org/pypi/{pkg['name']}/json"
                version_js = f"fetch('{api_url}').then(r => r.json()).then(d => d.info.version).catch(() => 'N/A')"
                version = page.evaluate(version_js)
                pkg['version'] = version or 'N/A'
            except Exception:
                pkg['version'] = 'N/A'
            results.append(pkg)

        print("=" * 60)
        print(f"PyPI: {query}")
        print("=" * 60)
        for idx, r in enumerate(results, 1):
            print(f"\n{idx}. {r['name']} (v{r['version']})")
            print(f"   {r['description']}")

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