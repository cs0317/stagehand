"""
Playwright script (Python) — Cleveland Clinic Health Search
Search for health information on Cleveland Clinic.
"""

import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from urllib.parse import quote_plus
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class ClevelandClinicSearchRequest:
    query: str = "migraine"
    max_results: int = 5


@dataclass
class HealthArticleItem:
    title: str = ""
    category: str = ""
    summary: str = ""
    url: str = ""


@dataclass
class ClevelandClinicSearchResult:
    query: str = ""
    items: List[HealthArticleItem] = field(default_factory=list)


def search_clevelandclinic(page: Page, request: ClevelandClinicSearchRequest) -> ClevelandClinicSearchResult:
    """Search Cleveland Clinic for health articles."""
    encoded = quote_plus(request.query)
    url = f"https://my.clevelandclinic.org/health/search-results?query={encoded}"
    print(f"Loading {url}...")
    checkpoint("Navigate to search")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(6000)

    result = ClevelandClinicSearchResult(query=request.query)

    checkpoint("Extract health articles")
    js_code = """(max) => {
        const items = [];
        const cards = document.querySelectorAll('[class*="result"], [class*="card"], article, li[class*="search"]');
        for (const card of cards) {
            if (items.length >= max) break;

            let title = '';
            const titleEl = card.querySelector('h2 a, h3 a, a[class*="title"], [class*="heading"] a');
            if (titleEl) title = titleEl.textContent.trim();
            if (!title || title.length < 3 || title.length > 300) continue;
            if (items.some(i => i.title === title)) continue;

            let category = '';
            const catEl = card.querySelector('[class*="category"], [class*="type"], [class*="label"]');
            if (catEl) category = catEl.textContent.trim();

            let summary = '';
            const descEl = card.querySelector('p, [class*="description"], [class*="snippet"]');
            if (descEl) summary = descEl.textContent.trim().substring(0, 200);

            let href = '';
            if (titleEl && titleEl.href) href = titleEl.href;

            items.push({title: title, category: category, summary: summary, url: href});
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = HealthArticleItem()
        item.title = d.get("title", "")
        item.category = d.get("category", "")
        item.summary = d.get("summary", "")
        item.url = d.get("url", "")
        result.items.append(item)

    print(f"\nFound {len(result.items)} articles for '{request.query}':")
    for i, item in enumerate(result.items, 1):
        print(f"\n  {i}. {item.title}")
        print(f"     Category: {item.category}")
        print(f"     {item.summary[:100]}...")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("clevelandclinic")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            result = search_clevelandclinic(page, ClevelandClinicSearchRequest())
            print("\n=== DONE ===")
            print(f"Found {len(result.items)} articles")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
