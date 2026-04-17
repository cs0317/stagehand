import re
import os
from dataclasses import dataclass
from urllib.parse import quote_plus
from playwright.sync_api import sync_playwright, Page

import sys as _sys
import os as _os
_sys.path.insert(0, _os.path.join(_os.path.dirname(__file__), ".."))
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class PricelineHotelsRequest:
    destination: str = "Las Vegas, NV"
    guests: int = 2
    check_in: str = ""
    check_out: str = ""
    max_results: int = 5


@dataclass(frozen=True)
class PricelineHotel:
    hotel_name: str = ""
    star_rating: str = ""
    nightly_price: str = ""
    guest_rating: str = ""
    neighborhood: str = ""


@dataclass(frozen=True)
class PricelineHotelsResult:
    hotels: list = None  # list[PricelineHotel]


# Search for hotels on Priceline for a destination and extract
# hotel name, star rating, nightly price, guest rating, and neighborhood.
def priceline_hotels(page: Page, request: PricelineHotelsRequest) -> PricelineHotelsResult:
    destination = request.destination
    guests = request.guests
    check_in = request.check_in
    check_out = request.check_out
    max_results = request.max_results
    print(f"  Destination: {destination}")
    print(f"  Guests: {guests}")
    print(f"  Check-in: {check_in or '(default)'}")
    print(f"  Check-out: {check_out or '(default)'}")
    print(f"  Max results: {max_results}\n")

    # Build URL — use Priceline hotel search with destination
    dest_encoded = quote_plus(destination)
    url = f"https://www.priceline.com/hotel-deals/{dest_encoded}"

    print(f"Loading {url}...")
    checkpoint(f"Navigate to {url}")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(10000)
    print(f"  Loaded: {page.url}")

    # If we hit a bot check page, try waiting longer for it to clear
    body_text = page.inner_text("body", timeout=5000)
    if "Press & Hold" in body_text or "not a bot" in body_text.lower():
        print("  Bot check detected, waiting for manual clearance...")
        page.wait_for_timeout(15000)
        body_text = page.inner_text("body", timeout=5000)

    results = []

    # Try structured extraction via hotel card elements
    cards = page.locator(
        '[class*="HotelCard"], '
        '[class*="hotel-card"], '
        '[class*="HotelListItem"], '
        '[class*="hotel-listing"], '
        '[data-testid*="hotel"], '
        '[class*="PropertyCard"]'
    )
    count = cards.count()
    print(f"  Found {count} hotel cards via selectors")

    if count > 0:
        for i in range(min(count, max_results)):
            card = cards.nth(i)
            try:
                card_text = card.inner_text(timeout=3000).strip()
                lines = [l.strip() for l in card_text.split("\n") if l.strip()]

                hotel_name = "N/A"
                star_rating = "N/A"
                nightly_price = "N/A"
                guest_rating = "N/A"
                neighborhood = "N/A"

                for line in lines:
                    # Price pattern: $123 or $1,234
                    pm = re.search(r'\$[\d,]+', line)
                    if pm and nightly_price == "N/A":
                        nightly_price = pm.group(0)
                        continue
                    # Star rating: "4-star" or "3.5 star" or "★★★★"
                    sm = re.search(r'([\d.]+)\s*[-\s]?\s*[Ss]tar', line)
                    if sm and star_rating == "N/A":
                        star_rating = sm.group(1)
                        continue
                    star_count = line.count("★")
                    if star_count >= 1 and star_rating == "N/A":
                        star_rating = str(star_count)
                        continue
                    # Guest rating: "8.5/10" or "8.5 out of 10" or just "8.5"
                    gm = re.search(r'(\d+\.?\d*)\s*/\s*10', line)
                    if gm and guest_rating == "N/A":
                        guest_rating = gm.group(0)
                        continue
                    gm2 = re.search(r'(\d+\.?\d*)\s+out\s+of\s+10', line)
                    if gm2 and guest_rating == "N/A":
                        guest_rating = f"{gm2.group(1)}/10"
                        continue
                    # Neighborhood patterns
                    if re.search(r'(strip|downtown|north|south|east|west|center|district|area|mile)', line, re.IGNORECASE):
                        if neighborhood == "N/A" and len(line) < 80:
                            neighborhood = line
                            continue
                    # Hotel name — longer descriptive text
                    if len(line) > 5 and hotel_name == "N/A" and not re.match(r'^[\d,.$%/]+$', line):
                        hotel_name = line

                if hotel_name != "N/A":
                    results.append(PricelineHotel(
                        hotel_name=hotel_name,
                        star_rating=star_rating,
                        nightly_price=nightly_price,
                        guest_rating=guest_rating,
                        neighborhood=neighborhood,
                    ))
            except Exception:
                continue

    # Fallback: text-based extraction
    if not results:
        print("  Card selectors missed, trying text-based extraction...")
        text_lines = [l.strip() for l in body_text.split("\n") if l.strip()]

        i = 0
        while i < len(text_lines) and len(results) < max_results:
            line = text_lines[i]
            # Look for price as an anchor to identify a hotel block
            price_match = re.search(r'\$[\d,]+', line)
            if price_match:
                nightly_price = price_match.group(0)
                hotel_name = "N/A"
                star_rating = "N/A"
                guest_rating = "N/A"
                neighborhood = "N/A"

                # Scan nearby lines for hotel details
                start = max(0, i - 8)
                end = min(len(text_lines), i + 5)
                for j in range(start, end):
                    if j == i:
                        continue
                    nearby = text_lines[j]
                    # Star rating
                    sm = re.search(r'([\d.]+)\s*[-\s]?\s*[Ss]tar', nearby)
                    if sm and star_rating == "N/A":
                        star_rating = sm.group(1)
                        continue
                    # Guest rating
                    gm = re.search(r'(\d+\.?\d*)\s*/\s*10', nearby)
                    if gm and guest_rating == "N/A":
                        guest_rating = gm.group(0)
                        continue
                    # Neighborhood
                    if re.search(r'(strip|downtown|north|south|east|west|center|district|area|mile)', nearby, re.IGNORECASE):
                        if neighborhood == "N/A" and len(nearby) < 80:
                            neighborhood = nearby
                            continue
                    # Hotel name — descriptive text, not too short, not numeric
                    if (len(nearby) > 10 and len(nearby) < 100
                            and not re.match(r'^[\d,.$%/\s]+$', nearby)
                            and hotel_name == "N/A"
                            and not re.search(r'(filter|sort|search|sign in|log in|cookie)', nearby, re.IGNORECASE)):
                        hotel_name = nearby

                if hotel_name != "N/A":
                    results.append(PricelineHotel(
                        hotel_name=hotel_name,
                        star_rating=star_rating,
                        nightly_price=nightly_price,
                        guest_rating=guest_rating,
                        neighborhood=neighborhood,
                    ))
            i += 1

        results = results[:max_results]

    print("=" * 60)
    print(f"Priceline - Hotel Results for \"{destination}\"")
    print("=" * 60)
    for idx, h in enumerate(results, 1):
        print(f"\n{idx}. {h.hotel_name}")
        print(f"   Stars: {h.star_rating}")
        print(f"   Price: {h.nightly_price}/night")
        print(f"   Guest Rating: {h.guest_rating}")
        print(f"   Neighborhood: {h.neighborhood}")

    print(f"\nFound {len(results)} hotels")

    return PricelineHotelsResult(hotels=results)


def test_func():
    import subprocess, time, shutil
    from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws

    subprocess.call("taskkill /f /im chrome.exe", stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(2)

    port = get_free_port()
    profile_dir = get_temp_profile_dir("priceline")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as p:
        browser = p.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        request = PricelineHotelsRequest()
        result = priceline_hotels(page, request)
        print(f"\nFound {len(result.hotels)} hotels")
        for h in result.hotels:
            print(f"  {h.hotel_name} - {h.star_rating} stars - {h.nightly_price}/night - Rating: {h.guest_rating} - {h.neighborhood}")
        browser.close()
    chrome_proc.terminate()
    shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
