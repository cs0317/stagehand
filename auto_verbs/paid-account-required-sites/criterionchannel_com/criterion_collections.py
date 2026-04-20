"""
Playwright script (Python) — Criterion Channel Collections
Browse curated film collections on Criterion Channel.
"""

import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class CriterionCollectionsRequest:
    max_results: int = 5


@dataclass
class CollectionItem:
    name: str = ""
    num_films: str = ""
    curator: str = ""
    description: str = ""


@dataclass
class CriterionCollectionsResult:
    items: List[CollectionItem] = field(default_factory=list)


def browse_criterion_collections(page: Page, request: CriterionCollectionsRequest) -> CriterionCollectionsResult:
    """Browse Criterion Channel curated film collections."""
    url = "https://www.criterionchannel.com/collections"
    print(f"Loading {url}...")
    checkpoint("Navigate to collections")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(6000)

    result = CriterionCollectionsResult()

    checkpoint("Extract collections")
    js_code = """(max) => {
        const items = [];
        const els = document.querySelectorAll('[class*="collection"], [class*="card"], article, [class*="item"], [class*="browse-item"]');
        for (const el of els) {
            if (items.length >= max) break;
            const text = (el.textContent || '').replace(/\\s+/g, ' ').trim();

            let name = '';
            const nameEl = el.querySelector('h2, h3, h4, [class*="title"], a[class*="title"]');
            if (nameEl) name = nameEl.textContent.trim();
            if (!name || name.length < 3 || name.length > 200) continue;
            if (items.some(i => i.name === name)) continue;

            let numFilms = '';
            const filmMatch = text.match(/(\\d+)\\s*(?:film|movie|title)/i);
            if (filmMatch) numFilms = filmMatch[0];

            let curator = '';
            const curatorEl = el.querySelector('[class*="curator"], [class*="author"], [class*="by"]');
            if (curatorEl) curator = curatorEl.textContent.replace(/curated by|by/i, '').trim();

            let description = '';
            const descEl = el.querySelector('p, [class*="description"], [class*="summary"]');
            if (descEl) description = descEl.textContent.trim().substring(0, 200);

            items.push({name: name, num_films: numFilms, curator: curator, description: description});
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = CollectionItem()
        item.name = d.get("name", "")
        item.num_films = d.get("num_films", "")
        item.curator = d.get("curator", "")
        item.description = d.get("description", "")
        result.items.append(item)

    print(f"\nFound {len(result.items)} collections:")
    for i, item in enumerate(result.items, 1):
        print(f"\n  {i}. {item.name}")
        print(f"     Films: {item.num_films}  Curator: {item.curator}")
        print(f"     {item.description[:100]}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("criterion")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            result = browse_criterion_collections(page, CriterionCollectionsRequest())
            print("\n=== DONE ===")
            print(f"Found {len(result.items)} collections")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
