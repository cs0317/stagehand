"""
Auto-generated Playwright script (Python)
Angi.com – Home Service Professional Search
Service: "plumber" near "Phoenix, AZ"

Generated on: 2026-04-15T18:29:46.943Z
Recorded 2 browser interactions

Uses Playwright's native locator API with the user's Chrome profile.
"""

import os, sys, shutil, re, traceback
from urllib.parse import quote
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws


def build_angi_url(service_type: str, location: str) -> str:
    """Build Angi company directory URL from service and location."""
    city = location.split(",")[0].strip().lower().replace(" ", "-")
    svc_map = {
        "plumber": "plumbing", "electrician": "electricians",
        "painter": "painting", "roofer": "roofing",
        "landscaper": "landscaping", "carpenter": "carpentry",
        "handyman": "handyman", "hvac": "heating-and-air-conditioning",
        "cleaner": "house-cleaning", "mover": "movers",
    }
    svc = svc_map.get(service_type.lower(), service_type.lower())
    return f"https://www.angi.com/companylist/{city}/{svc}.htm"


def run(
    playwright: Playwright,
    service_type: str = "plumber",
    location: str = "Phoenix, AZ",
    max_results: int = 5,
) -> list:
    print("=" * 59)
    print("  Angi.com – Home Service Professional Search")
    print("=" * 59)
    print(f'  Service: "{service_type}" near "{location}"\n')

    port = get_free_port()
    profile_dir = get_temp_profile_dir("angi_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        # ── Navigate to Angi directory page ───────────────────────────
        url = build_angi_url(service_type, location)
        print(f"Loading: {url}")
        page.goto(url, timeout=30000)
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(2000)
        print(f"  Loaded: {page.url}")

        # ── Dismiss popups / cookie banners ───────────────────────────
        for sel in [
            "#onetrust-accept-btn-handler",
            "button:has-text('Accept')",
            "button:has-text('Got it')",
            "button:has-text('No, thanks')",
            "[data-testid='close-button']",
            "button[aria-label='Close']",
        ]:
            try:
                btn = page.locator(sel).first
                if btn.is_visible(timeout=1500):
                    btn.evaluate("el => el.click()")
                    page.wait_for_timeout(500)
            except Exception:
                pass

        # ── Extract professionals ─────────────────────────────────────
        print(f"Extracting up to {max_results} professionals...")

        # Try to find professional cards on the directory page
        cards = page.locator(
            "[data-testid*='provider'], "
            "[data-testid*='result'], "
            "div[role='listitem'], "
            "article"
        )
        count = cards.count()
        print(f"  Found {count} result cards")

        for i in range(min(count, max_results)):
            card = cards.nth(i)
            try:
                name = "N/A"
                try:
                    name_el = card.locator("h2, h3, h4, a[data-testid], [data-testid*='name']").first
                    name = name_el.inner_text(timeout=3000).strip()
                except Exception:
                    pass

                rating = "N/A"
                try:
                    rating_el = card.locator("[aria-label*='star'], [aria-label*='rating'], [data-testid*='rating']").first
                    rating = rating_el.get_attribute("aria-label") or rating_el.inner_text(timeout=3000).strip()
                except Exception:
                    pass

                reviews = "N/A"
                try:
                    reviews_el = card.locator("span:has-text('review'), [data-testid*='review']").first
                    reviews = reviews_el.inner_text(timeout=3000).strip()
                except Exception:
                    pass

                services = "N/A"
                try:
                    services_el = card.locator("[data-testid*='service'], [class*='category']").first
                    services = services_el.inner_text(timeout=3000).strip()
                except Exception:
                    pass

                if name != "N/A":
                    results.append({
                        "name": name,
                        "rating": rating,
                        "reviews": reviews,
                        "services": services,
                    })
            except Exception:
                continue

        # Fallback: parse page text for professional-like entries
        if not results:
            print("  Card extraction failed, trying text fallback...")
            body_text = page.evaluate("document.body.innerText") or ""
            lines = [l.strip() for l in body_text.split("\n") if l.strip()]
            i = 0
            while i < len(lines) and len(results) < max_results:
                line = lines[i]
                if re.search(r'\b\d\.\d\b', line) and ("review" in line.lower() or "rating" in line.lower()):
                    name = lines[i - 1] if i > 0 else "N/A"
                    results.append({
                        "name": name,
                        "rating": line,
                        "reviews": "N/A",
                        "services": "N/A",
                    })
                i += 1

        # ── Print results ─────────────────────────────────────────────
        print(f"\nFound {len(results)} professionals for '{service_type}' near '{location}':")
        for i, pro in enumerate(results, 1):
            print(f"  {i}. {pro['name']}")
            print(f"     Rating: {pro['rating']}  Reviews: {pro['reviews']}")
            print(f"     Services: {pro['services']}")

    except Exception as e:
        print(f"\nError: {e}")
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
        print(f"\nTotal professionals found: {len(items)}")
