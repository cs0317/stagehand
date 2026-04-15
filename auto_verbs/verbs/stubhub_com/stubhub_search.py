"""
Playwright script (Python) — StubHub Event Ticket Search
Search for event tickets by keyword.
Extract event name, venue, date, and lowest ticket price.

URL pattern: https://www.stubhub.com/secure/search?q={query}
"""

import re
import os
import sys
import shutil
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws


MONTHS_3 = {
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
}

VENUE_RE = re.compile(
    r"^(TBA|\d{1,2}:\d{2}\s*[AP]M)"   # time portion
    r"(.+?,\s*[A-Z]{2},\s*US(?:A)?)"   # city, ST, US
    r"(.+)$"                            # venue
)

VENUE_INTL_RE = re.compile(
    r"^(TBA|\d{1,2}:\d{2}\s*[AP]M)"   # time portion
    r"(.+?,\s*.+)"                      # city, country
)


def _parse_venue_line(line: str):
    """Split a combined time+location+venue line."""
    m = VENUE_RE.match(line)
    if m:
        return m.group(1).strip(), m.group(2).strip(), m.group(3).strip()
    m = VENUE_INTL_RE.match(line)
    if m:
        return m.group(1).strip(), m.group(2).strip(), ""
    return "", line, ""


def run(
    playwright: Playwright,
    query: str = "NBA",
    max_results: int = 5,
) -> list:
    print(f"  Query: {query}")
    print(f"  Max results: {max_results}\n")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("stubhub_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        from urllib.parse import quote_plus

        search_url = f"https://www.stubhub.com/secure/search?q={quote_plus(query)}"
        print(f"Loading {search_url}...")
        page.goto(search_url, timeout=30000)
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(5000)
        print(f"  Loaded: {page.url}")

        # Collect event page hrefs for price lookup
        link_els = page.locator('a[href*="/event/"]')
        link_count = link_els.count()
        event_hrefs = []
        for i in range(link_count):
            href = link_els.nth(i).get_attribute("href") or ""
            if "/event/" in href:
                event_hrefs.append(href)

        # Parse body text for event listing blocks
        body = page.locator("body").inner_text(timeout=10000)
        lines = [l.strip() for l in body.split("\n") if l.strip()]

        print(f"\nParsing {len(lines)} body lines...")

        # Find "See tickets" markers — each marks end of an event block
        ticket_indices = [i for i, l in enumerate(lines) if l == "See tickets"]

        events_raw = []
        for ti in ticket_indices:
            if len(events_raw) >= max_results:
                break
            # venue line is right before "See tickets"
            if ti < 2:
                continue
            venue_line = lines[ti - 1]
            event_name = lines[ti - 2]

            # Parse venue line
            time_str, location, venue = _parse_venue_line(venue_line)

            # Collect date lines above event name
            date_parts = []
            idx = ti - 3
            while idx >= 0:
                candidate = lines[idx]
                # Stop if we hit another "See tickets" or a non-date line
                if candidate == "See tickets" or candidate == "See more":
                    break
                if candidate in MONTHS_3 or re.match(r"^\d{1,2}(-\d{1,2})?$", candidate) or re.match(
                    r"^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)(-\w+)?$", candidate
                ):
                    date_parts.insert(0, candidate)
                    idx -= 1
                elif candidate == "TBA":
                    date_parts.insert(0, "TBA")
                    idx -= 1
                else:
                    break

            date_str = " ".join(date_parts) if date_parts else "TBA"
            if time_str and time_str != "TBA":
                date_str += f" {time_str}"

            events_raw.append(
                {
                    "name": event_name,
                    "venue": venue if venue else location,
                    "date": date_str,
                    "location": location,
                    "price": "N/A",
                }
            )

        # Attempt to get lowest price from each event's detail page
        for i, evt in enumerate(events_raw):
            if i >= len(event_hrefs):
                break
            href = event_hrefs[i]
            if not href.startswith("http"):
                href = "https://www.stubhub.com" + href
            # Strip tracking params to speed up
            base_href = href.split("?")[0]
            try:
                print(f"  Checking price for: {evt['name'][:60]}...")
                page.goto(base_href, timeout=20000)
                page.wait_for_load_state("domcontentloaded")
                page.wait_for_timeout(4000)

                detail_body = page.locator("body").inner_text(timeout=8000)
                # Find first $ amount
                price_match = re.search(r"\$(\d[\d,]*)", detail_body)
                if price_match:
                    evt["price"] = f"${price_match.group(1)}"
            except Exception as e:
                print(f"    Could not get price: {e}")

        results = events_raw[:max_results]

        print(f'\nFound {len(results)} events for "{query}":\n')
        for idx, e in enumerate(results, 1):
            print(f"  {idx}. {e['name']}")
            print(f"     Venue: {e['venue']}")
            print(f"     Date: {e['date']}")
            print(f"     Location: {e['location']}")
            print(f"     Lowest Price: {e['price']}")
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
        print(f"\nTotal events found: {len(items)}")
