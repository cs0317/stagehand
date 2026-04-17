"""
Vivino – Wine Search verb
Search Vivino for wines and extract listings with name, winery, region, rating, and price.
"""

import re
import os
from dataclasses import dataclass
from urllib.parse import quote as url_quote
from playwright.sync_api import Page, sync_playwright

import sys as _sys
import os as _os
_sys.path.insert(0, _os.path.join(_os.path.dirname(__file__), ".."))
from playwright_debugger import checkpoint

# ── Types ─────────────────────────────────────────────────────────────────────

@dataclass
class VivinoSearchRequest:
    search_term: str    # e.g. "Pinot Noir"
    max_results: int    # number of wines to extract

@dataclass
class VivinoWine:
    wine_name: str       # name of the wine
    winery: str          # producer / winery
    region: str          # region or country
    average_rating: str  # e.g. "4.2"
    num_ratings: str     # e.g. "1,234 ratings"
    price: str           # e.g. "$19.99"

@dataclass
class VivinoSearchResult:
    wines: list  # list of VivinoWine

# ── Verb ──────────────────────────────────────────────────────────────────────

def vivino_search(page: Page, request: VivinoSearchRequest) -> VivinoSearchResult:
    """
    Search Vivino for wines and extract listings.

    Args:
        page: Playwright page.
        request: VivinoSearchRequest with search_term and max_results.

    Returns:
        VivinoSearchResult containing a list of VivinoWine.
    """
    search_url = f"https://www.vivino.com/search/wines?q={url_quote(request.search_term)}"
    print(f"Loading {search_url}...")
    page.goto(search_url)
    page.wait_for_load_state("domcontentloaded")
    page.wait_for_timeout(3000)
    print(f"  Loaded: {page.url}")
    checkpoint("Loaded Vivino search page")

    # Dismiss cookie banners
    for selector in [
        'button:has-text("Accept")',
        'button:has-text("Accept All")',
        'button:has-text("Got it")',
        '#onetrust-accept-btn-handler',
        '[data-testid="cookie-accept"]',
    ]:
        try:
            btn = page.locator(selector).first
            if btn.is_visible(timeout=1500):
                btn.click()
                page.wait_for_timeout(500)
                break
        except Exception:
            pass

    # Extract wine cards
    print(f"Extracting up to {request.max_results} wines...")

    wine_cards = page.locator(
        '[class*="wineCard"], '
        '[class*="wine-card"], '
        '[data-testid*="wine"], '
        '.search-results-list .card'
    )
    count = wine_cards.count()
    print(f"  Found {count} wine cards")

    results = []
    seen_names = set()
    for i in range(count):
        if len(results) >= request.max_results:
            break
        card = wine_cards.nth(i)
        try:
            wine_name = "N/A"
            try:
                name_el = card.locator(
                    '[class*="wine-name"], [class*="wineName"], '
                    'h3, [class*="vintageTitle"]'
                ).first
                wine_name = name_el.inner_text(timeout=2000).strip()
            except Exception:
                pass
            if wine_name == "N/A" or wine_name.lower() in seen_names:
                continue
            seen_names.add(wine_name.lower())

            winery = "N/A"
            try:
                w_el = card.locator('[class*="winery"], [class*="producer"]').first
                winery = w_el.inner_text(timeout=2000).strip()
            except Exception:
                pass

            region = "N/A"
            try:
                r_el = card.locator('[class*="region"], [class*="country"]').first
                region = r_el.inner_text(timeout=2000).strip()
            except Exception:
                pass

            avg_rating = "N/A"
            try:
                rt_el = card.locator('[class*="averageRating"], [class*="rating"]').first
                avg_rating = rt_el.inner_text(timeout=2000).strip()
            except Exception:
                pass

            num_ratings = "N/A"
            try:
                nr_el = card.locator('[class*="ratingCount"], [class*="ratings"]').first
                num_ratings = nr_el.inner_text(timeout=2000).strip()
            except Exception:
                pass

            price = "N/A"
            try:
                p_el = card.locator('[class*="price"], [class*="addToCart"]').first
                price = p_el.inner_text(timeout=2000).strip()
                pm = re.search(r"[\$€£][\d.,]+", price)
                if pm:
                    price = pm.group(0)
            except Exception:
                pass

            results.append(VivinoWine(
                wine_name=wine_name,
                winery=winery,
                region=region,
                average_rating=avg_rating,
                num_ratings=num_ratings,
                price=price,
            ))
        except Exception:
            continue

    # Fallback: parse page text
    if not results:
        print("  Card extraction failed, trying text fallback...")
        body = page.evaluate("document.body.innerText") or ""
        lines = body.split("\n")
        for i, line in enumerate(lines):
            if len(results) >= request.max_results:
                break
            rating_m = re.search(r"(\d\.\d)\s*/?\s*5?", line)
            price_m = re.search(r"[\$€£][\d.,]+", line)
            if rating_m and price_m:
                wine_name = "N/A"
                for j in range(max(0, i - 3), i):
                    c = lines[j].strip()
                    if c and len(c) > 3:
                        wine_name = c
                        break
                if wine_name != "N/A":
                    results.append(VivinoWine(
                        wine_name=wine_name,
                        winery="N/A",
                        region="N/A",
                        average_rating=rating_m.group(1),
                        num_ratings="N/A",
                        price=price_m.group(0),
                    ))

    checkpoint("Extracted wine results")
    print(f'\nFound {len(results)} wines for "{request.search_term}":')
    for i, w in enumerate(results, 1):
        print(f"  {i}. {w.wine_name}")
        print(f"     Winery: {w.winery}  Region: {w.region}")
        print(f"     Rating: {w.average_rating}  ({w.num_ratings})  Price: {w.price}")

    return VivinoSearchResult(wines=results)

# ── Test ──────────────────────────────────────────────────────────────────────

def test_func():

    with sync_playwright() as pw:
        browser = pw.chromium.launch(
            channel="chrome",
            headless=False,
            args=["--disable-blink-features=AutomationControlled"],
        )
        page = browser.new_page()

        request = VivinoSearchRequest(search_term="Pinot Noir", max_results=5)
        result = vivino_search(page, request)
        print(f"\nTotal wines found: {len(result.wines)}")

if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
