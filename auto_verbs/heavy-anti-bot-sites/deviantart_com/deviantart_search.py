import re
import os
from dataclasses import dataclass
from playwright.sync_api import sync_playwright, Page

import sys as _sys
import os as _os
_sys.path.insert(0, _os.path.join(_os.path.dirname(__file__), ".."))
from playwright_debugger import checkpoint

@dataclass(frozen=True)
class DeviantartSearchRequest:
    search_query: str = "digital fantasy art"
    max_results: int = 5

@dataclass(frozen=True)
class DeviantartArtwork:
    title: str = ""
    artist_name: str = ""
    favorites: str = ""
    category: str = ""

@dataclass(frozen=True)
class DeviantartSearchResult:
    artworks: list = None  # list[DeviantartArtwork]

# Search DeviantArt for artwork matching a query and extract artwork listings including
# title, artist name, number of favorites, and category.
def deviantart_search(page: Page, request: DeviantartSearchRequest) -> DeviantartSearchResult:
    search_query = request.search_query
    max_results = request.max_results
    print(f"  Search query: {search_query}")
    print(f"  Max results to extract: {max_results}\n")

    url = "https://www.deviantart.com"
    print(f"Loading {url}...")
    checkpoint(f"Navigate to {url}")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(3000)
    print(f"  Loaded: {page.url}")

    # Look for the search input and perform the search
    search_input = page.locator('input[type="search"], input[name="q"], input[placeholder*="earch"]').first
    try:
        search_input.click(timeout=5000)
        search_input.fill(search_query)
        page.keyboard.press("Enter")
        page.wait_for_timeout(5000)
        print(f"  Searched for: {search_query}")
        print(f"  Current URL: {page.url}")
    except Exception as e:
        # Fallback: navigate directly to search URL
        search_url = f"https://www.deviantart.com/search?q={search_query.replace(' ', '+')}"
        print(f"  Search input not found, navigating directly to {search_url}")
        checkpoint(f"Navigate to search URL for '{search_query}'")
        page.goto(search_url, wait_until="domcontentloaded")
        page.wait_for_timeout(5000)
        print(f"  Loaded: {page.url}")

    results = []

    # Try structured extraction via artwork card elements
    cards = page.locator(
        'a[data-hook="deviation_link"], '
        'div[data-testid="thumb"], '
        'div[class*="deviation"], '
        'a[href*="/art/"]'
    )
    count = cards.count()
    print(f"  Found {count} artwork cards via selectors")

    if count > 0:
        for i in range(min(count, max_results * 3)):
            if len(results) >= max_results:
                break
            card = cards.nth(i)
            try:
                card_text = card.inner_text(timeout=3000).strip()
                if not card_text:
                    continue
                lines = [l.strip() for l in card_text.split("\n") if l.strip()]

                title = "N/A"
                artist_name = "N/A"
                favorites = "N/A"
                category = "N/A"

                # Try to get title from aria-label or alt attribute
                aria = card.get_attribute("aria-label") or ""
                if aria:
                    title = aria

                for line in lines:
                    # Favorites count (number with optional K/M suffix)
                    fm = re.search(r'(\d[\d,.]*[KkMm]?)\s*(?:fav|like|❤|♥)', line, re.I)
                    if fm:
                        favorites = fm.group(1)
                        continue
                    # Plain number that could be favorites
                    if re.match(r'^\d[\d,.]*[KkMm]?$', line):
                        if favorites == "N/A":
                            favorites = line
                        continue
                    # Artist name (starts with "by" or short username-like)
                    bm = re.match(r'^by\s+(.+)', line, re.I)
                    if bm:
                        artist_name = bm.group(1).strip()
                        continue
                    # Title: longer text, not a number
                    if len(line) > 2 and not re.match(r'^[\d$%]', line):
                        if title == "N/A":
                            title = line
                        elif artist_name == "N/A" and len(line) < 30:
                            artist_name = line

                # Try href for category hints
                href = card.get_attribute("href") or ""
                cm = re.search(r'/(\w+)/art/', href)
                if cm:
                    category = cm.group(1)

                if title != "N/A":
                    # Deduplicate
                    if not any(r.title == title for r in results):
                        results.append(DeviantartArtwork(
                            title=title,
                            artist_name=artist_name,
                            favorites=favorites,
                            category=category,
                        ))
            except Exception:
                continue

    # Fallback: text-based extraction from page body
    if not results:
        print("  Card selectors missed, trying text-based extraction...")
        body_text = page.evaluate("document.body ? document.body.innerText : ''") or ""
        text_lines = [l.strip() for l in body_text.split("\n") if l.strip()]

        i = 0
        while i < len(text_lines) and len(results) < max_results:
            line = text_lines[i]
            # Look for lines that could be artwork titles (medium length, not navigation)
            if (10 < len(line) < 120
                    and not re.match(r'^[\d$%]', line)
                    and 'log in' not in line.lower()
                    and 'sign up' not in line.lower()
                    and 'cookie' not in line.lower()):
                title = line
                artist_name = "N/A"
                favorites = "N/A"
                category = "N/A"

                # Check nearby lines for artist/favorites
                for j in range(i + 1, min(len(text_lines), i + 5)):
                    nearby = text_lines[j]
                    bm = re.match(r'^by\s+(.+)', nearby, re.I)
                    if bm:
                        artist_name = bm.group(1).strip()
                    fm = re.search(r'(\d[\d,.]*[KkMm]?)\s*(?:fav|like|❤|♥)', nearby, re.I)
                    if fm:
                        favorites = fm.group(1)

                if artist_name != "N/A":
                    results.append(DeviantartArtwork(
                        title=title,
                        artist_name=artist_name,
                        favorites=favorites,
                        category=category,
                    ))
            i += 1

    print("=" * 60)
    print(f"DeviantArt – Search Results for '{search_query}'")
    print("=" * 60)
    for idx, a in enumerate(results, 1):
        print(f"\n{idx}. {a.title}")
        print(f"   Artist: {a.artist_name}")
        print(f"   Favorites: {a.favorites}")
        print(f"   Category: {a.category}")

    print(f"\nFound {len(results)} artworks")

    return DeviantartSearchResult(artworks=results)

def test_func():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(
            channel="chrome",
            headless=False,
            args=["--disable-blink-features=AutomationControlled"],
        )
        page = browser.new_page()
        result = deviantart_search(page, DeviantartSearchRequest())
        print(f"\nReturned {len(result.artworks or [])} artworks")
        browser.close()

if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
