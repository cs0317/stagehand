"""
Whisky Advocate – Search for whisky reviews by keyword

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
class WhiskyadvocateSearchRequest:
    search_query: str = "bourbon"
    max_results: int = 5


@dataclass
class WhiskyReviewItem:
    whisky_name: str = ""
    distillery: str = ""
    region: str = ""
    score: str = ""
    price: str = ""
    age: str = ""
    proof: str = ""
    review_summary: str = ""


@dataclass
class WhiskyadvocateSearchResult:
    items: List[WhiskyReviewItem] = field(default_factory=list)


def whiskyadvocate_search(page: Page, request: WhiskyadvocateSearchRequest) -> WhiskyadvocateSearchResult:
    """Search for whisky reviews on Whisky Advocate."""
    print(f"  Query: {request.search_query}\n")

    query = request.search_query.replace(" ", "+")
    url = f"https://www.whiskyadvocate.com/ratings-reviews/?search={query}"
    print(f"Loading {url}...")
    checkpoint("Navigate to Whisky Advocate search results")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    result = WhiskyadvocateSearchResult()

    checkpoint("Extract whisky review listings")
    js_code = """(max) => {
        const cards = document.querySelectorAll('article, [class*="review"], [class*="result"], [class*="Rating"], [class*="card"], .post');
        const items = [];
        for (const card of cards) {
            if (items.length >= max) break;
            const nameEl = card.querySelector('h2, h3, [class*="title"], [class*="name"]');
            const distilleryEl = card.querySelector('[class*="distillery"], [class*="brand"], [class*="producer"]');
            const regionEl = card.querySelector('[class*="region"], [class*="origin"], [class*="country"]');
            const scoreEl = card.querySelector('[class*="score"], [class*="rating"], [class*="points"]');
            const priceEl = card.querySelector('[class*="price"], [class*="cost"]');
            const ageEl = card.querySelector('[class*="age"], [class*="years"]');
            const proofEl = card.querySelector('[class*="proof"], [class*="abv"], [class*="alcohol"]');
            const summaryEl = card.querySelector('p, [class*="description"], [class*="summary"], [class*="excerpt"], [class*="review"]');

            const whisky_name = nameEl ? nameEl.textContent.trim() : '';
            const distillery = distilleryEl ? distilleryEl.textContent.trim() : '';
            const region = regionEl ? regionEl.textContent.trim() : '';
            const score = scoreEl ? scoreEl.textContent.trim() : '';
            const price = priceEl ? priceEl.textContent.trim() : '';
            const age = ageEl ? ageEl.textContent.trim() : '';
            const proof = proofEl ? proofEl.textContent.trim() : '';
            const review_summary = summaryEl ? summaryEl.textContent.trim() : '';

            if (whisky_name) {
                items.push({whisky_name, distillery, region, score, price, age, proof, review_summary});
            }
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = WhiskyReviewItem()
        item.whisky_name = d.get("whisky_name", "")
        item.distillery = d.get("distillery", "")
        item.region = d.get("region", "")
        item.score = d.get("score", "")
        item.price = d.get("price", "")
        item.age = d.get("age", "")
        item.proof = d.get("proof", "")
        item.review_summary = d.get("review_summary", "")
        result.items.append(item)

    for i, item in enumerate(result.items, 1):
        print(f"\n  Review {i}:")
        print(f"    Name:      {item.whisky_name}")
        print(f"    Distillery: {item.distillery}")
        print(f"    Region:    {item.region}")
        print(f"    Score:     {item.score}")
        print(f"    Price:     {item.price}")
        print(f"    Age:       {item.age}")
        print(f"    Proof:     {item.proof}")
        print(f"    Summary:   {item.review_summary[:100]}...")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("whiskyadvocate")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            request = WhiskyadvocateSearchRequest()
            result = whiskyadvocate_search(page, request)
            print("\n=== DONE ===")
            print(f"Found {len(result.items)} reviews")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
