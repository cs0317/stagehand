"""
Playwright script (Python) — PyPI Package Search
Search PyPI for web scraping packages.
"""

import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class PyPIRequest:
    query: str = "web scraping"
    max_results: int = 5


@dataclass
class PackageItem:
    name: str = ""
    version: str = ""
    description: str = ""
    author: str = ""
    last_release: str = ""


@dataclass
class PyPIResult:
    packages: List[PackageItem] = field(default_factory=list)


# Searches PyPI for packages and extracts package name, version,
# description, author, and last release date.
def search_pypi(page: Page, request: PyPIRequest) -> PyPIResult:
    url = f"https://pypi.org/search/?q={request.query.replace(' ', '+')}"
    print(f"Loading {url}...")
    checkpoint("Navigate to PyPI search")
    page.goto(url, wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(5000)

    result = PyPIResult()

    checkpoint("Extract package listings")
    js_code = """(max) => {
        const results = [];
        const items = document.querySelectorAll('a.package-snippet');
        for (const item of items) {
            if (results.length >= max) break;
            const nameEl = item.querySelector('.package-snippet__name');
            const name = nameEl ? nameEl.textContent.trim() : '';
            if (!name) continue;

            const verEl = item.querySelector('.package-snippet__version');
            const version = verEl ? verEl.textContent.trim() : '';

            const descEl = item.querySelector('.package-snippet__description');
            const description = descEl ? descEl.textContent.trim() : '';

            const dateEl = item.querySelector('.package-snippet__created time');
            const last_release = dateEl ? dateEl.textContent.trim() : '';

            results.push({ name, version, description, author: '', last_release });
        }
        return results;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = PackageItem()
        item.name = d.get("name", "")
        item.version = d.get("version", "")
        item.description = d.get("description", "")
        item.author = d.get("author", "")
        item.last_release = d.get("last_release", "")
        result.packages.append(item)

    print(f"\nFound {len(result.packages)} packages:")
    for i, p in enumerate(result.packages, 1):
        print(f"\n  {i}. {p.name} v{p.version}")
        print(f"     {p.description}")
        print(f"     Released: {p.last_release}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("pypi")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            result = search_pypi(page, PyPIRequest())
            print("\n=== DONE ===")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
