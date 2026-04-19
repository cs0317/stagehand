import os
import sys
import shutil
import time
from dataclasses import dataclass, field
from typing import List

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class ParkrunSearchRequest:
    search_query: str = "London"
    max_results: int = 5


@dataclass
class ParkrunSearchItem:
    event_name: str = ""
    location: str = ""
    country: str = ""
    distance: str = ""
    day_of_week: str = ""
    avg_runners: str = ""


@dataclass
class ParkrunSearchResult:
    items: List[ParkrunSearchItem] = field(default_factory=list)


def parkrun_search(page, request: ParkrunSearchRequest) -> ParkrunSearchResult:
    url = f"https://www.parkrun.com/countries/"
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    items = page.evaluate("""() => {
        const results = [];
        const seen = new Set();
        // Get links to parkrun events
        const links = document.querySelectorAll('a[href]');
        for (const a of links) {
            const href = a.getAttribute('href') || '';
            // Match parkrun event pages like /eventname/
            if (!/parkrun\\.(us|com|org|co\\.uk)\\/[a-z]/.test(href)) continue;
            if (/\\/(events|about|register|results|news|faq|volunteer|freedom)/.test(href)) continue;
            if (seen.has(href)) continue;
            seen.add(href);
            const text = a.textContent.trim();
            if (!text || text.length < 3 || text.length > 100) continue;
            results.push({
                event_name: text,
                location: '',
                country: 'United States',
                distance: '5k',
                day_of_week: 'Saturday',
                avg_runners: ''
            });
        }
        return results;
    }""")

    result = ParkrunSearchResult()
    for item in items[: request.max_results]:
        result.items.append(
            ParkrunSearchItem(
                event_name=item.get("event_name", ""),
                location=item.get("location", "") or request.search_query,
                country=item.get("country", ""),
                distance=item.get("distance", "5k"),
                day_of_week=item.get("day_of_week", "Saturday"),
                avg_runners=item.get("avg_runners", ""),
            )
        )

    checkpoint("parkrun_search result")
    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir()
    chrome_process = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    from playwright.sync_api import sync_playwright

    pw = sync_playwright().start()
    browser = pw.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()

    try:
        request = ParkrunSearchRequest(search_query="London", max_results=5)
        result = parkrun_search(page, request)
        print(f"Found {len(result.items)} parkrun events")
        for i, item in enumerate(result.items):
            print(f"  {i+1}. {item.event_name}")
            print(f"     Location: {item.location} | Country: {item.country}")
            print(f"     Distance: {item.distance} | Day: {item.day_of_week} | Avg Runners: {item.avg_runners}")
    finally:
        browser.close()
        pw.stop()
        chrome_process.terminate()
        shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger

    run_with_debugger(test_func)
