"""
Playwright script (Python) — NPM Package Search
Search npm for date formatting packages.
"""

import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class NpmRequest:
    query: str = "date formatting"
    max_results: int = 5


@dataclass
class PackageItem:
    name: str = ""
    version: str = ""
    weekly_downloads: str = ""
    description: str = ""
    last_published: str = ""


@dataclass
class NpmResult:
    packages: List[PackageItem] = field(default_factory=list)


# Searches npm for packages and extracts package name, version,
# weekly downloads, description, and last publish date.
def search_npm(page: Page, request: NpmRequest) -> NpmResult:
    url = f"https://www.npmjs.com/search?q={request.query.replace(' ', '+')}"
    print(f"Loading {url}...")
    checkpoint("Navigate to npm search")
    page.goto(url, wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(5000)

    result = NpmResult()

    checkpoint("Extract package listings")
    js_code = """(max) => {
        const results = [];
        const seen = new Set();
        // npm search uses H3 for package names
        const h3s = document.querySelectorAll('h3');
        for (const h3 of h3s) {
            if (results.length >= max) break;
            const name = h3.innerText.trim();
            if (!name || name.length < 1 || seen.has(name)) continue;
            // Skip nav/UI headings
            if (name.match(/^(Search|Sign|Log|npm|Products|Pricing|Documentation)/i)) continue;
            seen.add(name);

            const container = h3.closest('section, div, li') || h3.parentElement;
            const text = container ? container.innerText : '';

            const pEl = container ? container.querySelector('p') : null;
            const description = pEl ? pEl.innerText.trim().substring(0, 200) : '';

            const versionMatch = text.match(/(\\d+\\.\\d+\\.\\d+)/);
            const version = versionMatch ? versionMatch[1] : '';

            const downloadsMatch = text.match(/([\\d,]+)\\s*(weekly|downloads)/i);
            const weekly_downloads = downloadsMatch ? downloadsMatch[1] : '';

            const publishedMatch = text.match(/(\\d+\\s+\\w+\\s+ago|published\\s+.+?)(?:\\n|$)/i);
            const last_published = publishedMatch ? publishedMatch[1] : '';

            results.push({ name, version, weekly_downloads, description, last_published });
        }
        return results;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = PackageItem()
        item.name = d.get("name", "")
        item.version = d.get("version", "")
        item.weekly_downloads = d.get("weekly_downloads", "")
        item.description = d.get("description", "")
        item.last_published = d.get("last_published", "")
        result.packages.append(item)

    print(f"\nFound {len(result.packages)} packages:")
    for i, p in enumerate(result.packages, 1):
        print(f"\n  {i}. {p.name} v{p.version}")
        print(f"     Downloads: {p.weekly_downloads}  Published: {p.last_published}")
        print(f"     {p.description[:80]}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("npm")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            result = search_npm(page, NpmRequest())
            print("\n=== DONE ===")
            print(f"Found {len(result.packages)} packages")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
