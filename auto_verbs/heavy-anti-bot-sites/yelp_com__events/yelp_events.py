"""Playwright script (Python) — Yelp Events"""
import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint

@dataclass(frozen=True)
class YelpEventsRequest:
    location: str = "San Francisco, CA"
    max_results: int = 5

@dataclass
class EventItem:
    name: str = ""
    date: str = ""
    venue: str = ""
    category: str = ""
    description: str = ""

@dataclass
class YelpEventsResult:
    events: List[EventItem] = field(default_factory=list)

def get_yelp_events(page: Page, request: YelpEventsRequest) -> YelpEventsResult:
    url = f"https://www.yelp.com/events?location={request.location.replace(' ', '+')}"
    checkpoint("Navigate to Yelp events")
    page.goto(url, wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(8000)
    result = YelpEventsResult()
    js_code = """(max) => {
        const results = [];
        const cards = document.querySelectorAll('[class*="event"], [class*="card"], li[class*="list"]');
        for (const card of cards) {
            if (results.length >= max) break;
            const nameEl = card.querySelector('h3, h2, a[class*="event"]');
            const name = nameEl ? nameEl.textContent.trim() : '';
            if (!name) continue;
            const dateEl = card.querySelector('[class*="date"], time');
            const date = dateEl ? dateEl.textContent.trim() : '';
            const venueEl = card.querySelector('[class*="venue"], [class*="location"]');
            const venue = venueEl ? venueEl.textContent.trim() : '';
            const catEl = card.querySelector('[class*="category"], [class*="tag"]');
            const category = catEl ? catEl.textContent.trim() : '';
            const descEl = card.querySelector('p, [class*="description"]');
            const description = descEl ? descEl.textContent.trim() : '';
            results.push({ name, date, venue, category, description });
        }
        return results;
    }"""
    for d in page.evaluate(js_code, request.max_results):
        item = EventItem()
        item.name = d.get("name", "")
        item.date = d.get("date", "")
        item.venue = d.get("venue", "")
        item.category = d.get("category", "")
        item.description = d.get("description", "")
        result.events.append(item)
    print(f"Found {len(result.events)} events")
    return result

def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("yelp_events")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            get_yelp_events(page, YelpEventsRequest())
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)

if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
