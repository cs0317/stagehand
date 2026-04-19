"""
Viator – Search for tours and activities

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
class ViatorSearchRequest:
    search_query: str = "Rome walking tour"
    max_results: int = 5


@dataclass
class ViatorTourItem:
    tour_name: str = ""
    price: str = ""
    duration: str = ""
    rating: str = ""
    num_reviews: str = ""
    location: str = ""
    highlights: str = ""


@dataclass
class ViatorSearchResult:
    items: List[ViatorTourItem] = field(default_factory=list)


# Search for tours and activities on Viator.
def viator_search(page: Page, request: ViatorSearchRequest) -> ViatorSearchResult:
    """Search for tours and activities on Viator."""
    print(f"  Query: {request.search_query}\n")

    query = request.search_query.replace(" ", "%20")
    url = f"https://www.viator.com/searchResults/all?text={request.search_query.replace(' ', '+')}"
    print(f"Loading {url}...")
    checkpoint("Navigate to Viator search results")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    result = ViatorSearchResult()

    checkpoint("Extract tour listings")
    js_code = """(max) => {
        const cards = document.querySelectorAll('[data-testid="product-card"], [class*="ProductCard"], [class*="product-card"], article, [class*="Card"]');
        const items = [];
        for (const card of cards) {
            if (items.length >= max) break;
            const nameEl = card.querySelector('h2, h3, [class*="title"], [data-testid="product-title"]');
            const priceEl = card.querySelector('[class*="price"], [data-testid="price"], [class*="Price"]');
            const durationEl = card.querySelector('[class*="duration"], [data-testid="duration"], [class*="Duration"]');
            const ratingEl = card.querySelector('[class*="rating"], [data-testid="rating"], [class*="Rating"]');
            const reviewsEl = card.querySelector('[class*="review"], [data-testid="review-count"], [class*="Review"]');
            const locationEl = card.querySelector('[class*="location"], [class*="Location"]');
            const highlightsEl = card.querySelector('[class*="highlight"], [class*="description"], p');

            const tour_name = nameEl ? nameEl.textContent.trim() : '';
            const price = priceEl ? priceEl.textContent.trim() : '';
            const duration = durationEl ? durationEl.textContent.trim() : '';
            const rating = ratingEl ? ratingEl.textContent.trim() : '';
            const num_reviews = reviewsEl ? reviewsEl.textContent.trim() : '';
            const location = locationEl ? locationEl.textContent.trim() : '';
            const highlights = highlightsEl ? highlightsEl.textContent.trim() : '';

            if (tour_name) {
                items.push({tour_name, price, duration, rating, num_reviews, location, highlights});
            }
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = ViatorTourItem()
        item.tour_name = d.get("tour_name", "")
        item.price = d.get("price", "")
        item.duration = d.get("duration", "")
        item.rating = d.get("rating", "")
        item.num_reviews = d.get("num_reviews", "")
        item.location = d.get("location", "")
        item.highlights = d.get("highlights", "")
        result.items.append(item)

    for i, item in enumerate(result.items, 1):
        print(f"\n  Tour {i}:")
        print(f"    Name:       {item.tour_name}")
        print(f"    Price:      {item.price}")
        print(f"    Duration:   {item.duration}")
        print(f"    Rating:     {item.rating}")
        print(f"    Reviews:    {item.num_reviews}")
        print(f"    Location:   {item.location}")
        print(f"    Highlights: {item.highlights[:100]}...")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("viator")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            request = ViatorSearchRequest()
            result = viator_search(page, request)
            print("\n=== DONE ===")
            print(f"Found {len(result.items)} tours")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
