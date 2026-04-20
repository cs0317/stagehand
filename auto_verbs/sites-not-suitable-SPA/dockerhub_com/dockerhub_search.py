"""
Playwright script (Python) — Docker Hub Search
Search Docker Hub for container images.
"""

import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class DockerHubSearchRequest:
    search_query: str = "python"
    max_results: int = 5


@dataclass
class DockerImageItem:
    name: str = ""
    publisher: str = ""
    pulls: str = ""
    stars: str = ""
    last_updated: str = ""


@dataclass
class DockerHubSearchResult:
    query: str = ""
    items: List[DockerImageItem] = field(default_factory=list)


def search_dockerhub(page: Page, request: DockerHubSearchRequest) -> DockerHubSearchResult:
    """Search Docker Hub for container images."""
    url = f"https://hub.docker.com/search?q={request.search_query}"
    print(f"Loading {url}...")
    checkpoint("Navigate to search results")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    result = DockerHubSearchResult(query=request.search_query)

    checkpoint("Extract images")
    js_code = """(max) => {
        const items = [];
        const cards = document.querySelectorAll('[data-testid="imageSearchResult"], [class*="SearchResult"], a[href*="/r/"], a[href*="/_/"]');
        for (const card of cards) {
            if (items.length >= max) break;
            const text = (card.textContent || '').replace(/\\s+/g, ' ').trim();
            const nameEl = card.querySelector('h3, [class*="title"], [class*="name"]');
            let name = nameEl ? nameEl.textContent.trim() : '';
            if (!name || name.length < 2) continue;
            if (items.some(r => r.name === name)) continue;

            let publisher = '';
            const pubEl = card.querySelector('[class*="publisher"], [class*="source"], [class*="namespace"]');
            if (pubEl) publisher = pubEl.textContent.trim();

            let pulls = '';
            const pullMatch = text.match(/([\\d.]+[KMB]?\\+?)\\s*(?:pulls|downloads)/i);
            if (pullMatch) pulls = pullMatch[1];

            let stars = '';
            const starMatch = text.match(/([\\d.]+[KMB]?\\+?)\\s*(?:stars)/i);
            if (starMatch) stars = starMatch[1];

            let updated = '';
            const updMatch = text.match(/(?:updated|last pushed)\\s+([\\w\\s,]+ago|[\\d/-]+)/i);
            if (updMatch) updated = updMatch[1].trim();

            items.push({name, publisher, pulls, stars, last_updated: updated});
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = DockerImageItem()
        item.name = d.get("name", "")
        item.publisher = d.get("publisher", "")
        item.pulls = d.get("pulls", "")
        item.stars = d.get("stars", "")
        item.last_updated = d.get("last_updated", "")
        result.items.append(item)

    print(f"\\nFound {len(result.items)} images for '{request.search_query}':")
    for i, item in enumerate(result.items, 1):
        print(f"\\n  {i}. {item.name}")
        print(f"     Publisher: {item.publisher}  Pulls: {item.pulls}  Stars: {item.stars}")
        print(f"     Updated: {item.last_updated}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("dockerhub")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            result = search_dockerhub(page, DockerHubSearchRequest())
            print("\\n=== DONE ===")
            print(f"Found {len(result.items)} images")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
