"""
Playwright script (Python) — Momondo Flight Search
Search Momondo for cheapest flights.
"""

import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class MomondoRequest:
    origin: str = "CHI"
    destination: str = "TYO"
    date: str = "2025-06-15"
    max_results: int = 5


@dataclass
class FlightItem:
    airline: str = ""
    departure: str = ""
    arrival: str = ""
    duration: str = ""
    stops: str = ""
    price: str = ""


@dataclass
class MomondoResult:
    flights: List[FlightItem] = field(default_factory=list)


# Searches Momondo for flights and extracts airline, departure/arrival
# times, duration, stops, and price.
def search_momondo_flights(page: Page, request: MomondoRequest) -> MomondoResult:
    url = f"https://www.momondo.com/flight-search/{request.origin}-{request.destination}/{request.date}?sort=price_a"
    print(f"Loading {url}...")
    checkpoint("Navigate to Momondo flight search")
    page.goto(url, wait_until="domcontentloaded", timeout=45000)
    page.wait_for_timeout(15000)

    result = MomondoResult()

    checkpoint("Extract flight results")
    js_code = """(max) => {
        const results = [];
        const items = document.querySelectorAll('[class*="result"], [class*="flight"], [role="listitem"]');
        for (const item of items) {
            if (results.length >= max) break;
            const text = item.textContent.trim();
            if (text.length < 20) continue;

            const priceMatch = text.match(/\\$[\\d,]+/);
            if (!priceMatch) continue;

            const timeMatch = text.match(/(\\d{1,2}:\\d{2}\\s*[AP]M?)\\s*[-–]\\s*(\\d{1,2}:\\d{2}\\s*[AP]M?)/i);
            const durationMatch = text.match(/(\\d+h\\s*\\d*m?)/i);
            const stopsMatch = text.match(/(\\d+\\s*stops?|non-?stop)/i);

            results.push({
                airline: '',
                departure: timeMatch ? timeMatch[1] : '',
                arrival: timeMatch ? timeMatch[2] : '',
                duration: durationMatch ? durationMatch[1] : '',
                stops: stopsMatch ? stopsMatch[0] : '',
                price: priceMatch[0],
            });
        }
        return results;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = FlightItem()
        item.airline = d.get("airline", "")
        item.departure = d.get("departure", "")
        item.arrival = d.get("arrival", "")
        item.duration = d.get("duration", "")
        item.stops = d.get("stops", "")
        item.price = d.get("price", "")
        result.flights.append(item)

    print(f"\nFound {len(result.flights)} flights:")
    for i, f in enumerate(result.flights, 1):
        print(f"\n  {i}. {f.airline}")
        print(f"     {f.departure} -> {f.arrival} ({f.duration}) {f.stops}")
        print(f"     Price: {f.price}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("momondo")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            result = search_momondo_flights(page, MomondoRequest())
            print("\n=== DONE ===")
            print(f"Found {len(result.flights)} flights")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
