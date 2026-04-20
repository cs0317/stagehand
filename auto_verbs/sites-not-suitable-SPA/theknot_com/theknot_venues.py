"""Playwright script (Python) — The Knot"""
import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint

@dataclass(frozen=True)
class TheKnotRequest:
    location: str = "Austin, Texas"
    max_results: int = 5

@dataclass
class VenueItem:
    name: str = ""
    capacity: str = ""
    price_range: str = ""
    rating: str = ""
    reviews: str = ""

@dataclass
class TheKnotResult:
    venues: List[VenueItem] = field(default_factory=list)

def search_theknot(page: Page, request: TheKnotRequest) -> TheKnotResult:
    url = "https://www.theknot.com/marketplace/wedding-reception-venues-austin-tx"
    checkpoint("Navigate to The Knot venues")
    page.goto(url, wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(5000)
    page.evaluate("window.scrollBy(0, 800)")
    page.wait_for_timeout(5000)
    result = TheKnotResult()
    js_code = """(max) => {
        const results = [];
        const seen = new Set();
        const links = document.querySelectorAll('a[href*="/marketplace/"]');
        for (const a of links) {
            if (results.length >= max) break;
            const href = a.getAttribute('href') || '';
            // Only venue-specific links (with ID suffix), not category pages
            if (href.indexOf('venues') > -1 || href.length < 50) continue;
            if (seen.has(href)) continue;
            seen.add(href);
            const text = a.innerText.trim();
            const lines = text.split('\\n').map(l => l.trim()).filter(l => l.length > 0);
            // Extract venue name - skip 'Vendor Details', 'Location:', 'Stars', 'Reviews', state names
            let name = '';
            let rating = '';
            let reviews = '';
            for (const line of lines) {
                if (line === 'Vendor Details' || line === 'Location:' || line === 'Stars' || line === 'Reviews') continue;
                if (line.match(/^[A-Z]{2}$/) || line.match(/^(Texas|California|New York|Florida|Austin)/)) continue;
                if (line.match(/^\\d+\\.\\d+$/) || line.match(/^\\(\\d+\\)$/)) {
                    if (!rating && line.match(/^\\d/)) rating = line;
                    if (line.match(/^\\(/)) reviews = line;
                    continue;
                }
                if (!name && line.length > 3) name = line;
            }
            if (!name) {
                // Extract from URL slug as fallback
                const slug = href.split('/').pop().replace(/-\\d+$/, '').replace(/-/g, ' ');
                name = slug.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            }
            results.push({ name, capacity: '', price_range: '', rating, reviews });
        }
        return results;
    }"""
    for d in page.evaluate(js_code, request.max_results):
        item = VenueItem()
        item.name = d.get("name", "")
        item.price_range = d.get("price_range", "")
        item.rating = d.get("rating", "")
        item.reviews = d.get("reviews", "")
        result.venues.append(item)
    print(f"Found {len(result.venues)} venues")
    return result

def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("theknot")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            search_theknot(page, TheKnotRequest())
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)

if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
