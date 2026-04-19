"""
HealthyChildren.org – Search for pediatric health articles

Uses CDP-launched Chrome to avoid bot detection.
"""

import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class HealthychildrenSearchRequest:
    search_query: str = "infant sleep"
    max_results: int = 5


@dataclass
class HealthychildrenArticleItem:
    title: str = ""
    category: str = ""
    age_group: str = ""
    summary: str = ""
    url: str = ""


@dataclass
class HealthychildrenSearchResult:
    items: List[HealthychildrenArticleItem] = field(default_factory=list)


# Search for pediatric health articles on HealthyChildren.org (AAP).
def healthychildren_search(page: Page, request: HealthychildrenSearchRequest) -> HealthychildrenSearchResult:
    """Search for pediatric health articles on HealthyChildren.org."""
    print(f"  Query: {request.search_query}")
    print(f"  Max results: {request.max_results}\n")

    query_encoded = request.search_query.replace(" ", "+")
    url = f"https://www.healthychildren.org/English/search/Pages/results.aspx?q={query_encoded}"
    print(f"Loading {url}...")
    checkpoint("Navigate to HealthyChildren.org search results")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    result = HealthychildrenSearchResult()

    checkpoint("Extract article listings")
    js_code = """(max) => {
        const cards = document.querySelectorAll('[class*="result"], [class*="article"], [class*="search-result"], .result-item, [class*="listing"], [class*="card"]');
        const items = [];
        for (const card of cards) {
            if (items.length >= max) break;
            const titleEl = card.querySelector('h2, h3, h4, [class*="title"], [class*="Title"], a[class*="title"]');
            const categoryEl = card.querySelector('[class*="category"], [class*="Category"], [class*="topic"], [class*="tag"]');
            const ageEl = card.querySelector('[class*="age"], [class*="Age"], [class*="audience"]');
            const summaryEl = card.querySelector('p, [class*="summary"], [class*="description"], [class*="snippet"], [class*="excerpt"]');
            const linkEl = card.querySelector('a[href]');

            const title = titleEl ? titleEl.textContent.trim() : '';
            const category = categoryEl ? categoryEl.textContent.trim() : '';
            const age_group = ageEl ? ageEl.textContent.trim() : '';
            const summary = summaryEl ? summaryEl.textContent.trim() : '';
            const url = linkEl ? linkEl.href : '';

            if (title) {
                items.push({title, category, age_group, summary, url});
            }
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = HealthychildrenArticleItem()
        item.title = d.get("title", "")
        item.category = d.get("category", "")
        item.age_group = d.get("age_group", "")
        item.summary = d.get("summary", "")
        item.url = d.get("url", "")
        result.items.append(item)

    for i, item in enumerate(result.items, 1):
        print(f"\n  Article {i}:")
        print(f"    Title:    {item.title}")
        print(f"    Category: {item.category}")
        print(f"    Age:      {item.age_group}")
        print(f"    Summary:  {item.summary[:80]}")
        print(f"    URL:      {item.url}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("healthychildren")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            request = HealthychildrenSearchRequest()
            result = healthychildren_search(page, request)
            print("\n=== DONE ===")
            print(f"Found {len(result.items)} articles")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
