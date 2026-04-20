"""
Playwright script (Python) — Expedia Car Rental Search
Search for car rentals on Expedia.com.
"""

import os, sys, shutil
from datetime import date, timedelta
from dateutil.relativedelta import relativedelta
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class ExpediaCarSearchRequest:
    location: str = "Los Angeles"
    pickup_date: date = None
    dropoff_date: date = None
    max_results: int = 5


@dataclass
class CarRentalItem:
    car_type: str = ""
    company: str = ""
    price_per_day: str = ""
    total_price: str = ""
    features: str = ""


@dataclass
class ExpediaCarSearchResult:
    location: str = ""
    items: List[CarRentalItem] = field(default_factory=list)


# Searches Expedia.com for car rentals at the given location and date range,
# returning up to max_results options with car type, company, pricing, and features.
def search_expedia_car_rentals(page: Page, request: ExpediaCarSearchRequest) -> ExpediaCarSearchResult:
    url = "https://www.expedia.com/Cars"
    print(f"Loading {url}...")
    checkpoint("Navigate to Expedia Cars")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    result = ExpediaCarSearchResult(location=request.location)

    # Fill pickup location
    try:
        loc_input = page.locator('input[placeholder*="Pick-up"], input[placeholder*="location"], button:has-text("Pick-up location")').first
        checkpoint(f"Fill location: {request.location}")
        loc_input.click(timeout=3000)
        page.keyboard.press("Control+a")
        page.keyboard.type(request.location, delay=50)
        page.wait_for_timeout(2000)
        suggestion = page.locator('[role="option"], [data-stid*="suggestion"], li[class*="suggestion"]').first
        try:
            suggestion.click(timeout=3000)
        except Exception:
            page.keyboard.press("Enter")
        page.wait_for_timeout(1000)
    except Exception as e:
        print(f"Could not fill location: {e}")

    # Click search
    try:
        search_btn = page.locator('button:has-text("Search"), button[type="submit"]').first
        checkpoint("Click search")
        search_btn.click(timeout=3000)
        page.wait_for_timeout(8000)
    except Exception as e:
        print(f"Could not click search: {e}")

    checkpoint("Extract car rental listings")
    js_code = """(max) => {
        const results = [];
        const cards = document.querySelectorAll('[data-stid*="car"], [class*="offer"], [class*="listing"], article, .car-result');
        for (const card of cards) {
            if (results.length >= max) break;
            const text = (card.textContent || '').replace(/\\s+/g, ' ').trim();
            const titleEl = card.querySelector('h2, h3, h4, [class*="title"], [class*="car-name"]');
            const carType = titleEl ? titleEl.textContent.trim() : '';
            if (!carType || carType.length < 3) continue;
            if (results.some(r => r.car_type === carType)) continue;

            let company = '';
            const compEl = card.querySelector('[class*="supplier"], [class*="company"], [class*="vendor"], img[alt]');
            if (compEl) company = (compEl.getAttribute('alt') || compEl.textContent || '').trim();

            let pricePerDay = '';
            const pdMatch = text.match(/\\$[\\d,.]+\\s*\\/?\\s*day/i);
            if (pdMatch) pricePerDay = pdMatch[0];

            let totalPrice = '';
            const tpMatch = text.match(/(?:total|est\\.?)\\s*\\$[\\d,.]+/i);
            if (tpMatch) totalPrice = tpMatch[0];

            let features = '';
            const featEls = card.querySelectorAll('[class*="feature"], [class*="amenity"], li');
            const feats = [];
            for (const f of featEls) {
                const ft = f.textContent.trim();
                if (ft && ft.length < 50) feats.push(ft);
            }
            features = feats.slice(0, 5).join(', ');

            results.push({ car_type: carType, company, price_per_day: pricePerDay, total_price: totalPrice, features });
        }
        return results;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = CarRentalItem()
        item.car_type = d.get("car_type", "")
        item.company = d.get("company", "")
        item.price_per_day = d.get("price_per_day", "")
        item.total_price = d.get("total_price", "")
        item.features = d.get("features", "")
        result.items.append(item)

    print(f"\nFound {len(result.items)} car rentals in '{request.location}':")
    for i, item in enumerate(result.items, 1):
        print(f"\n  {i}. {item.car_type}")
        print(f"     Company: {item.company}  Price/day: {item.price_per_day}  Total: {item.total_price}")
        print(f"     Features: {item.features}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("expedia_car")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    today = date.today()
    pickup = today + relativedelta(months=1)
    dropoff = pickup + timedelta(days=3)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            result = search_expedia_car_rentals(page, ExpediaCarSearchRequest(
                location="Los Angeles",
                pickup_date=pickup,
                dropoff_date=dropoff,
            ))
            print("\n=== DONE ===")
            print(f"Found {len(result.items)} car rentals")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
