import os
import sys
import shutil
from dataclasses import dataclass, field
from typing import List

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class TripAdvisorHotelsSearchRequest:
    destination: str = "Paris"
    max_results: int = 5


@dataclass
class TripAdvisorHotelItem:
    hotel_name: str = ""
    rating: str = ""
    num_reviews: str = ""
    price_per_night: str = ""
    location: str = ""
    amenities: str = ""


@dataclass
class TripAdvisorHotelsSearchResult:
    hotels: List[TripAdvisorHotelItem] = field(default_factory=list)
    error: str = ""


def tripadvisor_hotels_search(page, request: TripAdvisorHotelsSearchRequest) -> TripAdvisorHotelsSearchResult:
    result = TripAdvisorHotelsSearchResult()
    try:
        url = f"https://www.tripadvisor.com/Search?q={request.destination}&searchSessionId=hotels"
        page.goto(url, wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(3000)

        checkpoint(page, "Search results loaded")

        hotels_data = page.evaluate("""() => {
            const hotels = [];
            const items = document.querySelectorAll('[data-test-target="hotels-list"] > div, [class*="result"], [class*="listing"], [class*="hotel-card"], .search-result');
            for (const item of items) {
                const nameEl = item.querySelector('h2, h3, [class*="title"], a[class*="name"], [data-test-target="hotel-name"]');
                const ratingEl = item.querySelector('[class*="rating"], [class*="bubble"], svg[class*="rating"]');
                const reviewsEl = item.querySelector('[class*="review"], [class*="count"]');
                const priceEl = item.querySelector('[class*="price"], [data-test-target="price"]');
                const locationEl = item.querySelector('[class*="location"], [class*="address"], [class*="neighborhood"]');
                const amenitiesEl = item.querySelector('[class*="amenities"], [class*="features"], [class*="highlights"]');
                hotels.push({
                    hotel_name: nameEl ? nameEl.textContent.trim() : '',
                    rating: ratingEl ? ratingEl.textContent.trim() : '',
                    num_reviews: reviewsEl ? reviewsEl.textContent.trim() : '',
                    price_per_night: priceEl ? priceEl.textContent.trim() : '',
                    location: locationEl ? locationEl.textContent.trim() : '',
                    amenities: amenitiesEl ? amenitiesEl.textContent.trim() : '',
                });
            }
            return hotels;
        }""")

        for item in hotels_data[:request.max_results]:
            result.hotels.append(TripAdvisorHotelItem(**item))

        checkpoint(page, f"Extracted {len(result.hotels)} hotels")

    except Exception as e:
        result.error = str(e)
    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir()
    chrome_proc = launch_chrome(port, profile_dir)
    ws_url = wait_for_cdp_ws(port)

    from playwright.sync_api import sync_playwright
    pw = sync_playwright().start()
    browser = pw.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()

    try:
        request = TripAdvisorHotelsSearchRequest()
        result = tripadvisor_hotels_search(page, request)
        print(f"Found {len(result.hotels)} hotels")
        for i, h in enumerate(result.hotels):
            print(f"  {i+1}. {h.hotel_name} - {h.rating} ({h.num_reviews}) - {h.price_per_night}")
        if result.error:
            print(f"Error: {result.error}")
    finally:
        browser.close()
        pw.stop()
        chrome_proc.terminate()
        shutil.rmtree(profile_dir, ignore_errors=True)


def run_with_debugger():
    test_func()


if __name__ == "__main__":
    run_with_debugger()
