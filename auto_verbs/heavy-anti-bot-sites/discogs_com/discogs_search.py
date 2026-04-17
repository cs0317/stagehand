import re
import os
from dataclasses import dataclass
from playwright.sync_api import sync_playwright, Page

import sys as _sys
import os as _os
_sys.path.insert(0, _os.path.join(_os.path.dirname(__file__), ".."))
from playwright_debugger import checkpoint

@dataclass(frozen=True)
class DiscogsSearchRequest:
    query: str = "Dark Side of the Moon"
    max_results: int = 5

@dataclass(frozen=True)
class DiscogsRelease:
    title: str = ""
    artist: str = ""
    format: str = ""
    year: str = ""
    label: str = ""

@dataclass(frozen=True)
class DiscogsSearchResult:
    releases: list = None  # list[DiscogsRelease]

# Search for music releases on Discogs matching a query and extract release
# title, artist, format, year, and label.
def discogs_search(page: Page, request: DiscogsSearchRequest) -> DiscogsSearchResult:
    query = request.query
    max_results = request.max_results
    print(f"  Query: {query}")
    print(f"  Max results to extract: {max_results}\n")

    url = f"https://www.discogs.com/search/?q={query.replace(' ', '+')}&type=release"
    print(f"Loading {url}...")
    checkpoint(f"Navigate to {url}")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(8000)
    print(f"  Loaded: {page.url}")

    # Wait for Cloudflare check to pass if present
    body = page.evaluate("document.body?.innerText || ''")
    if 'security verification' in body.lower() or 'security service' in body.lower():
        print("  Security check detected, waiting...")
        page.wait_for_timeout(10000)

    results = []

    # Each release has multiple a[href*="/release/"] links sharing the same href.
    # The one with text is the title link. Going 4 levels up gives the card text:
    # Format (e.g., VINYL/CD), Title, Artist, Released year, Region
    release_links = page.locator('a[href*="/release/"]')
    link_count = release_links.count()
    print(f"  Found {link_count} release links")

    seen_hrefs = set()
    for i in range(link_count):
        if len(results) >= max_results:
            break
        el = release_links.nth(i)
        href = el.get_attribute("href") or ""
        if not href or href in seen_hrefs:
            continue
        txt = el.inner_text(timeout=2000).strip()
        if not txt or len(txt) < 2:
            continue
        seen_hrefs.add(href)

        # Get the card text from parent container
        card_text = el.evaluate('''el => {
            let p = el;
            for (let i = 0; i < 4; i++) { if (p.parentElement) p = p.parentElement; }
            return p.innerText;
        }''')
        lines = [l.strip() for l in card_text.split("\n") if l.strip()]

        title = txt  # The title link text
        artist = "N/A"
        fmt = "N/A"
        year = "N/A"
        label = "N/A"

        format_keywords = {'VINYL', 'LP', 'CD', 'CASSETTE', 'ALBUM', 'SINGLE', 'EP',
                           'COMPILATION', 'BOX SET', 'DIGITAL', 'FLEXI', 'FILE'}

        for line in lines:
            if line == title:
                continue
            # Format: often first line, all-caps single word
            if fmt == "N/A" and line.upper() in format_keywords:
                fmt = line
                continue
            # Year: 4-digit year
            ym = re.search(r'\b(19\d{2}|20\d{2})\b', line)
            if ym and year == "N/A":
                year = ym.group(1)
                continue
            # Artist: first non-format, non-title line
            if artist == "N/A" and len(line) > 1 and line.upper() not in format_keywords:
                if not re.match(r'^Released', line) and 'Reissue' not in line:
                    artist = line
                    continue

        results.append(DiscogsRelease(
            title=title,
            artist=artist,
            format=fmt,
            year=year,
            label=label,
        ))

    print("=" * 60)
    print(f"Discogs – Search Results for '{query}'")
    print("=" * 60)
    for idx, r in enumerate(results, 1):
        print(f"\n{idx}. {r.title}")
        print(f"   Artist: {r.artist}")
        print(f"   Format: {r.format}")
        print(f"   Year: {r.year}")
        print(f"   Label: {r.label}")

    print(f"\nFound {len(results)} releases")

    return DiscogsSearchResult(releases=results)

def test_func():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(
            channel="chrome",
            headless=False,
            args=["--disable-blink-features=AutomationControlled"],
        )
        page = browser.new_page()
        result = discogs_search(page, DiscogsSearchRequest())
        print(f"\nReturned {len(result.releases or [])} releases")
        browser.close()

if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
