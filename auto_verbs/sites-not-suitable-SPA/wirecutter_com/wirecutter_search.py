"""
Wirecutter – Search for product recommendations

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
class WirecutterSearchRequest:
    search_query: str = "headphones"
    max_results: int = 5


@dataclass
class WirecutterArticleItem:
    title: str = ""
    top_pick: str = ""
    runner_up: str = ""
    budget_pick: str = ""
    publish_date: str = ""
    summary: str = ""


@dataclass
class WirecutterSearchResult:
    items: List[WirecutterArticleItem] = field(default_factory=list)


def wirecutter_search(page: Page, request: WirecutterSearchRequest) -> WirecutterSearchResult:
    """Search for product recommendations on Wirecutter."""
    print(f"  Query: {request.search_query}\n")

    query = request.search_query.replace(" ", "+")
    url = f"https://www.nytimes.com/wirecutter/search/?s={query}"
    print(f"Loading {url}...")
    checkpoint("Navigate to Wirecutter search results")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    result = WirecutterSearchResult()

    checkpoint("Extract product recommendation listings")
    js_code = """(max) => {
        const cards = document.querySelectorAll('article, [class*="result"], [class*="SearchResult"], [class*="card"], [class*="post"], li[class*="search"]');
        const items = [];
        for (const card of cards) {
            if (items.length >= max) break;
            const titleEl = card.querySelector('h2, h3, [class*="title"], [class*="headline"]');
            const topPickEl = card.querySelector('[class*="top-pick"], [class*="topPick"], [class*="pick"]:first-of-type');
            const runnerUpEl = card.querySelector('[class*="runner"], [class*="also-great"]');
            const budgetEl = card.querySelector('[class*="budget"], [class*="affordable"]');
            const dateEl = card.querySelector('time, [class*="date"], [class*="time"]');
            const summaryEl = card.querySelector('p, [class*="description"], [class*="summary"], [class*="excerpt"]');

            const title = titleEl ? titleEl.textContent.trim() : '';
            const top_pick = topPickEl ? topPickEl.textContent.trim() : '';
            const runner_up = runnerUpEl ? runnerUpEl.textContent.trim() : '';
            const budget_pick = budgetEl ? budgetEl.textContent.trim() : '';
            const publish_date = dateEl ? (dateEl.getAttribute('datetime') || dateEl.textContent.trim()) : '';
            const summary = summaryEl ? summaryEl.textContent.trim() : '';

            if (title) {
                items.push({title, top_pick, runner_up, budget_pick, publish_date, summary});
            }
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = WirecutterArticleItem()
        item.title = d.get("title", "")
        item.top_pick = d.get("top_pick", "")
        item.runner_up = d.get("runner_up", "")
        item.budget_pick = d.get("budget_pick", "")
        item.publish_date = d.get("publish_date", "")
        item.summary = d.get("summary", "")
        result.items.append(item)

    for i, item in enumerate(result.items, 1):
        print(f"\n  Article {i}:")
        print(f"    Title:       {item.title}")
        print(f"    Top Pick:    {item.top_pick}")
        print(f"    Runner Up:   {item.runner_up}")
        print(f"    Budget Pick: {item.budget_pick}")
        print(f"    Date:        {item.publish_date}")
        print(f"    Summary:     {item.summary[:100]}...")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("wirecutter")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            request = WirecutterSearchRequest()
            result = wirecutter_search(page, request)
            print("\n=== DONE ===")
            print(f"Found {len(result.items)} articles")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
