"""
Auto-generated Playwright script (Python)
AutoTrader.com – Used Car Search
Make: Toyota  Model: Camry
ZIP: 60601  Radius: 50 miles
Max results: 5

Generated on: 2026-04-15T19:43:59.387Z
Recorded 2 browser interactions
"""

import re
import os, sys, shutil
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws


def run(
    playwright: Playwright,
    make: str = "Toyota",
    model: str = "Camry",
    zip_code: str = "60601",
    radius_miles: int = 50,
    max_results: int = 5,
) -> list:
    print(f"  Make: {make}  Model: {model}")
    print(f"  ZIP: {zip_code}  Radius: {radius_miles} miles")
    print(f"  Max results: {max_results}\n")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("autotrader_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        # ── Navigate to search results ────────────────────────────────────
        make_lower = make.lower()
        model_lower = model.lower()
        search_url = (
            f"https://www.autotrader.com/cars-for-sale/used-cars/{make_lower}/{model_lower}"
            f"?zip={zip_code}&searchRadius={radius_miles}"
        )
        print(f"Loading {search_url}...")
        page.goto(search_url)
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(2000)
        # Wait for listing cards to appear (dynamic content)
        try:
            page.locator('div[data-cmp="inventoryListing"]').first.wait_for(state="visible", timeout=15000)
        except Exception:
            pass
        page.wait_for_timeout(2000)
        print(f"  Loaded: {page.url}")

        # ── Extract listings ──────────────────────────────────────────────
        print(f"Extracting up to {max_results} listings...")

        # AutoTrader listing cards: div[data-cmp="inventoryListing"]
        listing_cards = page.locator('div[data-cmp="inventoryListing"]')
        count = listing_cards.count()
        print(f"  Found {count} listing cards on page")

        for i in range(min(count, max_results)):
            card = listing_cards.nth(i)
            try:
                text = card.inner_text(timeout=3000)

                # Year/Make/Model from img alt attribute
                year_make_model = "N/A"
                img = card.locator('img[data-cmp="inventoryImage"]').first
                alt = img.get_attribute("alt", timeout=2000) or ""
                # alt format: "Used 2025 Toyota Camry SE w/ Package"
                m = re.match(r"(?:Used|Certified|New)?\s*(\d{4}\s+.+?)(?:\s+w/|$)", alt)
                if m:
                    year_make_model = m.group(1).strip()
                else:
                    year_make_model = alt.replace("Used ", "").replace("Certified ", "").strip()

                # Price: number with commas (e.g. "27,904") before "See payment"
                price = "N/A"
                m = re.search(r"(\d{1,3}(?:,\d{3})+)\s*\n?\s*(?:See payment|See estimated)", text)
                if m:
                    price = "$" + m.group(1)
                else:
                    # Fallback: look for 5+ digit number (prices are always 5+ digits)
                    m = re.search(r"(\d{2,3},\d{3})", text)
                    if m:
                        price = "$" + m.group(1)

                # Mileage: "64K mi" or "27,000 mi"
                mileage = "N/A"
                m = re.search(r"([\d,]+K?)\s*mi\b", text)
                if m:
                    mileage = m.group(1) + " mi"

                # Dealer name: look for "Sponsored by DealerName" or line before "mi. away"
                dealer = "N/A"
                m = re.search(r"Sponsored by\s+(.+?)(?:\n|$)", text)
                if m:
                    dealer = m.group(1).strip()
                else:
                    lines = [l.strip() for l in text.split("\n") if l.strip()]
                    for j, line in enumerate(lines):
                        if re.search(r"\d+\.?\d*\s*mi\.?\s*away", line):
                            # Dealer name is usually 1-2 lines before distance
                            for k in range(max(0, j - 3), j):
                                candidate = lines[k]
                                if (len(candidate) > 3
                                    and not re.match(r"^[\d$]", candidate)
                                    and "Request" not in candidate
                                    and "payment" not in candidate.lower()
                                    and "See " not in candidate
                                    and "Price" not in candidate
                                    and "Accident" not in candidate
                                    and "Info" not in candidate):
                                    dealer = candidate
                            break
                    # Fallback: look for phone number pattern and use line before it
                    if dealer == "N/A":
                        for j, line in enumerate(lines):
                            if re.search(r"\(\d{3}\)\s*\d{3}-\d{4}", line):
                                for k in range(max(0, j - 2), j):
                                    candidate = lines[k]
                                    if (len(candidate) > 3
                                        and not re.match(r"^[\d$]", candidate)
                                        and "Request" not in candidate):
                                        dealer = candidate
                                break

                if year_make_model == "N/A":
                    continue

                results.append({
                    "year_make_model": year_make_model,
                    "price": price,
                    "mileage": mileage,
                    "dealer": dealer,
                })
            except Exception:
                continue

        # ── Print results ─────────────────────────────────────────────────
        print(f"\nFound {len(results)} listings for '{make} {model}' near {zip_code}:\n")
        for i, car in enumerate(results, 1):
            print(f"  {i}. {car['year_make_model']}")
            print(f"     Price: {car['price']}  Mileage: {car['mileage']}")
            print(f"     Dealer: {car['dealer']}")
            print()

    except Exception as e:
        import traceback
        print(f"Error: {e}")
        traceback.print_exc()
    finally:
        try:
            browser.close()
        except Exception:
            pass
        chrome_proc.terminate()
        shutil.rmtree(profile_dir, ignore_errors=True)

    return results


if __name__ == "__main__":
    with sync_playwright() as playwright:
        items = run(playwright)
        print(f"\nTotal listings found: {len(items)}")
