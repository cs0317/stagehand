"""
Auto-generated Playwright script (Python)
VRBO – Vacation Rental Search
Destination: Lake Tahoe
Guests: 4  Nights: 6
Max results: 5

Uses Playwright with CDP connection to a real Chrome instance.
"""

import re
import os, sys, shutil
from datetime import date, timedelta
from dateutil.relativedelta import relativedelta
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws


def compute_dates(nights: int = 6):
    today = date.today()
    checkin = today + relativedelta(months=2)
    checkout = checkin + timedelta(days=nights)
    return checkin, checkout


def run(
    playwright: Playwright,
    destination: str = "Lake Tahoe",
    guests: int = 4,
    nights: int = 6,
    max_results: int = 5,
) -> list:
    checkin, checkout = compute_dates(nights)
    checkin_str = checkin.strftime("%Y-%m-%d")
    checkout_str = checkout.strftime("%Y-%m-%d")

    print(f"  Destination: {destination}")
    print(f"  Guests: {guests}  Nights: {nights}")
    print(f"  Check-in: {checkin_str}  Check-out: {checkout_str}\n")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("vrbo_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        # ── Navigate directly to search results ──────────────────────────
        dest_encoded = destination.replace(" ", "+")
        search_url = (
            f"https://www.vrbo.com/search"
            f"?destination={dest_encoded}"
            f"&startDate={checkin_str}&endDate={checkout_str}"
            f"&adults={guests}"
        )
        print(f"Loading {search_url}...")
        page.goto(search_url, timeout=30000)
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(2000)

        # ── Dismiss cookie consent ────────────────────────────────────────
        for selector in [
            "button#onetrust-accept-btn-handler",
            "button:has-text('Accept All')",
            "button:has-text('Accept')",
        ]:
            try:
                btn = page.locator(selector).first
                if btn.is_visible(timeout=1500):
                    btn.evaluate("el => el.click()")
                    page.wait_for_timeout(500)
                    break
            except Exception:
                pass

        # ── Wait for property cards ───────────────────────────────────────
        print("Waiting for property listings...")
        try:
            page.locator('[data-stid="lodging-card-responsive"]').first.wait_for(
                state="visible", timeout=15000
            )
        except Exception:
            pass
        page.wait_for_timeout(2000)
        print(f"  Loaded: {page.url}")

        # ── Extract properties ────────────────────────────────────────────
        print(f"Extracting up to {max_results} properties...")

        cards = page.locator('[data-stid="lodging-card-responsive"]')
        count = cards.count()
        print(f"  Found {count} property cards on page")

        for i in range(min(count, max_results)):
            card = cards.nth(i)
            try:
                text = card.inner_text(timeout=3000)
                lines = [ln.strip() for ln in text.split("\n") if ln.strip()]

                # ── Property name ─────────────────────────────────────────
                # Name appears after images/badges, before the details line.
                # The details line matches "Sleeps X · Y bedrooms · Z bathrooms".
                name = "N/A"
                details_idx = -1
                for j, ln in enumerate(lines):
                    if re.search(r"\d+\s*bedroom", ln, re.I):
                        details_idx = j
                        break
                if details_idx > 0:
                    # Name is the line just before details
                    name = lines[details_idx - 1]
                    # Clean up "Opens ... in new tab" prefix if present
                    name = re.sub(r"^Opens\s+", "", name)
                    name = re.sub(r"\s+in new tab$", "", name)

                # ── Bedrooms / Bathrooms ──────────────────────────────────
                bedrooms = "N/A"
                bathrooms = "N/A"
                if details_idx >= 0:
                    detail_line = lines[details_idx]
                    m_bed = re.search(r"(\d+)\s*bedroom", detail_line, re.I)
                    if m_bed:
                        bedrooms = m_bed.group(1)
                    m_bath = re.search(r"(\d+)\s*bathroom", detail_line, re.I)
                    if m_bath:
                        bathrooms = m_bath.group(1)

                # ── Rating ────────────────────────────────────────────────
                rating = "N/A"
                for ln in lines:
                    m = re.match(r"^(\d+\.?\d*)\s+out of\s+10$", ln)
                    if m:
                        rating = m.group(1)
                        break

                # ── Nightly price ─────────────────────────────────────────
                # "The current price is $X,XXX" or just "$X,XXX" per night
                nightly_price = "N/A"
                for ln in lines:
                    if "current price" in ln.lower():
                        m = re.search(r"\$[\d,]+", ln)
                        if m:
                            nightly_price = m.group(0)
                        break
                # Fallback: find "$X,XXX for N nights" and compute per-night
                if nightly_price == "N/A":
                    for ln in lines:
                        m = re.search(r"\$([\d,]+)\s+for\s+(\d+)\s+night", ln, re.I)
                        if m:
                            total = int(m.group(1).replace(",", ""))
                            n = int(m.group(2))
                            nightly_price = f"${total // n:,}"
                            break

                if name == "N/A":
                    continue

                results.append({
                    "name": name,
                    "nightly_price": nightly_price,
                    "bedrooms": bedrooms,
                    "bathrooms": bathrooms,
                    "rating": rating,
                })
            except Exception:
                continue

        # ── Print results ─────────────────────────────────────────────────
        print(f'\nFound {len(results)} properties in "{destination}":\n')
        for i, prop in enumerate(results, 1):
            print(f"  {i}. {prop['name']}")
            print(f"     Price/night: {prop['nightly_price']}  Bedrooms: {prop['bedrooms']}  Bathrooms: {prop['bathrooms']}  Rating: {prop['rating']}")
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
        print(f"\nTotal properties found: {len(items)}")
