"""
Playwright script (Python) — Kiwi.com Flight Search
Search Kiwi.com for flights and extract flight options.
"""

import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class KiwiFlightRequest:
    origin: str = "Berlin"
    destination: str = "Rome"
    max_results: int = 5


@dataclass
class FlightOption:
    airline: str = ""
    departure: str = ""
    arrival: str = ""
    duration: str = ""
    stops: str = ""
    price: str = ""


@dataclass
class KiwiFlightResult:
    origin: str = ""
    destination: str = ""
    items: List[FlightOption] = field(default_factory=list)


# Searches Kiwi.com for one-way flights from origin to destination and returns
# up to max_results flight options with airline, departure/arrival times, duration, stops, and price.
def search_kiwi_flights(page: Page, request: KiwiFlightRequest) -> KiwiFlightResult:
    url = f"https://www.kiwi.com/en/search/results/{request.origin.lower()}/{request.destination.lower()}/anytime/no-return"
    print(f"Loading {url}...")
    checkpoint("Navigate to Kiwi.com flight search results")
    page.goto(url, wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(8000)

    result = KiwiFlightResult(origin=request.origin, destination=request.destination)

    checkpoint("Extract flight listings")
    js_code = """(max) => {
        const results = [];
        // Kiwi.com uses result cards
        const cards = document.querySelectorAll(
            '[data-test="ResultCardWrapper"], [class*="ResultCard"], [class*="result-card"], [class*="itinerary"]'
        );
        const seen = new Set();
        for (const card of cards) {
            if (results.length >= max) break;
            const text = card.textContent.replace(/\\s+/g, ' ');
            const key = text.substring(0, 50);
            if (seen.has(key)) continue;
            seen.add(key);

            let airline = '', departure = '', arrival = '', duration = '', stops = '', price = '';

            // Extract times
            const timeEls = card.querySelectorAll('time, [class*="time"], [data-test*="Time"]');
            if (timeEls.length >= 2) {
                departure = timeEls[0].textContent.trim();
                arrival = timeEls[1].textContent.trim();
            }

            // Duration
            const durMatch = text.match(/(\\d+h\\s*\\d*m?|\\d+\\s*hr?\\s*\\d*\\s*min?)/i);
            if (durMatch) duration = durMatch[1];

            // Stops
            const stopMatch = text.match(/(direct|non.?stop|\\d+\\s*stop)/i);
            if (stopMatch) stops = stopMatch[1];

            // Price
            const priceMatch = text.match(/(\\$[\\d,]+|€[\\d,]+|[\\d,]+\\s*(?:USD|EUR))/i);
            if (priceMatch) price = priceMatch[1];

            // Airline
            const airEl = card.querySelector('[class*="carrier"], [class*="airline"], img[alt]');
            if (airEl) airline = airEl.getAttribute('alt') || airEl.textContent.trim();

            results.push({ airline, departure, arrival, duration, stops, price });
        }
        return results;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = FlightOption()
        item.airline = d.get("airline", "")
        item.departure = d.get("departure", "")
        item.arrival = d.get("arrival", "")
        item.duration = d.get("duration", "")
        item.stops = d.get("stops", "")
        item.price = d.get("price", "")
        result.items.append(item)

    print(f"\nFound {len(result.items)} flights from {request.origin} to {request.destination}:")
    for i, item in enumerate(result.items, 1):
        print(f"\n  {i}. {item.airline}")
        print(f"     {item.departure} -> {item.arrival}  Duration: {item.duration}")
        print(f"     Stops: {item.stops}  Price: {item.price}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("kiwi")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            result = search_kiwi_flights(page, KiwiFlightRequest())
            print("\n=== DONE ===")
            print(f"Found {len(result.items)} flights")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
