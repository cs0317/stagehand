"""
Surfline – Search for surf forecasts by keyword

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
class SurflineSearchRequest:
    search_query: str = "Malibu"
    max_results: int = 5


@dataclass
class SurflineSpotItem:
    spot_name: str = ""
    location: str = ""
    wave_height: str = ""
    wind_conditions: str = ""
    water_temp: str = ""
    rating: str = ""


@dataclass
class SurflineSearchResult:
    items: List[SurflineSpotItem] = field(default_factory=list)


# Search for surf forecasts on Surfline by keyword.
def surfline_search(page: Page, request: SurflineSearchRequest) -> SurflineSearchResult:
    """Search for surf forecasts on Surfline."""
    print(f"  Query: {request.search_query}\n")

    query = request.search_query.replace(" ", "+")
    url = f"https://www.surfline.com/search/{query}"
    print(f"Loading {url}...")
    checkpoint("Navigate to Surfline search results")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    result = SurflineSearchResult()

    checkpoint("Extract surf spot listings")
    js_code = """(max) => {
        const cards = document.querySelectorAll('[class*="SpotCard"], [class*="spot-card"], [class*="SearchResult"], [class*="search-result"], article');
        const items = [];
        for (const card of cards) {
            if (items.length >= max) break;
            const nameEl = card.querySelector('h2, h3, [class*="name"], [class*="title"], [class*="spot-name"]');
            const locationEl = card.querySelector('[class*="location"], [class*="region"], [class*="subtitle"]');
            const waveEl = card.querySelector('[class*="wave"], [class*="height"], [class*="swell"]');
            const windEl = card.querySelector('[class*="wind"], [class*="conditions"]');
            const tempEl = card.querySelector('[class*="temp"], [class*="water"]');
            const ratingEl = card.querySelector('[class*="rating"], [class*="quality"], [class*="score"]');

            const spot_name = nameEl ? nameEl.textContent.trim() : '';
            const location = locationEl ? locationEl.textContent.trim() : '';
            const wave_height = waveEl ? waveEl.textContent.trim() : '';
            const wind_conditions = windEl ? windEl.textContent.trim() : '';
            const water_temp = tempEl ? tempEl.textContent.trim() : '';
            const rating = ratingEl ? ratingEl.textContent.trim() : '';

            if (spot_name) {
                items.push({spot_name, location, wave_height, wind_conditions, water_temp, rating});
            }
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = SurflineSpotItem()
        item.spot_name = d.get("spot_name", "")
        item.location = d.get("location", "")
        item.wave_height = d.get("wave_height", "")
        item.wind_conditions = d.get("wind_conditions", "")
        item.water_temp = d.get("water_temp", "")
        item.rating = d.get("rating", "")
        result.items.append(item)

    for i, item in enumerate(result.items, 1):
        print(f"\n  Spot {i}:")
        print(f"    Name:       {item.spot_name}")
        print(f"    Location:   {item.location}")
        print(f"    Waves:      {item.wave_height}")
        print(f"    Wind:       {item.wind_conditions}")
        print(f"    Water Temp: {item.water_temp}")
        print(f"    Rating:     {item.rating}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("surfline")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            request = SurflineSearchRequest()
            result = surfline_search(page, request)
            print("\n=== DONE ===")
            print(f"Found {len(result.items)} spots")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
