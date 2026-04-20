"""
Playwright script (Python) — EurekAlert Search
Search EurekAlert for science press releases.
"""

import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class EurekAlertSearchRequest:
    search_query: str = "Alzheimer's research"
    max_results: int = 5


@dataclass
class PressReleaseItem:
    headline: str = ""
    institution: str = ""
    date: str = ""
    summary: str = ""


@dataclass
class EurekAlertSearchResult:
    query: str = ""
    items: List[PressReleaseItem] = field(default_factory=list)


def search_eurekalert(page: Page, request: EurekAlertSearchRequest) -> EurekAlertSearchResult:
    """Search EurekAlert for science press releases."""
    url = f"https://www.eurekalert.org/search?query={request.search_query.replace(' ', '+')}"
    print(f"Loading {url}...")
    checkpoint("Navigate to search results")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    result = EurekAlertSearchResult(query=request.search_query)

    checkpoint("Extract press releases")
    js_code = """(max) => {
        const items = [];
        const cards = document.querySelectorAll('.search-result, article, [class*="result"], .card');
        for (const card of cards) {
            if (items.length >= max) break;
            const nameEl = card.querySelector('h2, h3, h4, [class*="title"], a');
            const name = nameEl ? nameEl.textContent.trim() : '';
            if (!name || name.length < 10) continue;
            if (items.some(r => r.headline === name)) continue;

            let institution = '';
            const instEl = card.querySelector('[class*="source"], [class*="institution"], [class*="org"]');
            if (instEl) institution = instEl.textContent.trim();

            let date = '';
            const dateEl = card.querySelector('time, [class*="date"]');
            if (dateEl) date = dateEl.textContent.trim();

            let summary = '';
            const descEl = card.querySelector('p, [class*="summary"], [class*="desc"]');
            if (descEl) summary = descEl.textContent.trim().substring(0, 200);

            items.push({headline: name, institution, date, summary});
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = PressReleaseItem()
        item.headline = d.get("headline", "")
        item.institution = d.get("institution", "")
        item.date = d.get("date", "")
        item.summary = d.get("summary", "")
        result.items.append(item)

    print(f"\\nFound {len(result.items)} press releases for '{request.search_query}':")
    for i, item in enumerate(result.items, 1):
        print(f"\\n  {i}. {item.headline}")
        print(f"     Institution: {item.institution}  Date: {item.date}")
        if item.summary:
            print(f"     {item.summary[:100]}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("eurekalert")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            result = search_eurekalert(page, EurekAlertSearchRequest())
            print("\\n=== DONE ===")
            print(f"Found {len(result.items)} releases")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
