import os
import sys
import shutil
from dataclasses import dataclass, field
from typing import List

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class TVGuideSearchRequest:
    search_query: str = "drama"
    max_results: int = 5


@dataclass
class TVGuideShowItem:
    show_title: str = ""
    network: str = ""
    genre: str = ""
    air_time: str = ""
    rating: str = ""
    summary: str = ""


@dataclass
class TVGuideSearchResult:
    shows: List[TVGuideShowItem] = field(default_factory=list)
    error: str = ""


def tvguide_search(page, request: TVGuideSearchRequest) -> TVGuideSearchResult:
    result = TVGuideSearchResult()
    try:
        url = f"https://www.tvguide.com/search/?q={request.search_query}"
        page.goto(url, wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(3000)

        checkpoint("Search results loaded")

        shows_data = page.evaluate("""() => {
            const shows = [];
            const items = document.querySelectorAll('[class*="result"], [class*="show-card"], [class*="listing"], article, .search-result');
            for (const item of items) {
                const titleEl = item.querySelector('h2, h3, [class*="title"], a[class*="name"]');
                const networkEl = item.querySelector('[class*="network"], [class*="channel"], [class*="provider"]');
                const genreEl = item.querySelector('[class*="genre"], [class*="category"], [class*="tag"]');
                const timeEl = item.querySelector('[class*="time"], [class*="schedule"], [class*="air"]');
                const ratingEl = item.querySelector('[class*="rating"], [class*="score"]');
                const summaryEl = item.querySelector('p, [class*="description"], [class*="summary"], [class*="synopsis"]');
                shows.push({
                    show_title: titleEl ? titleEl.textContent.trim() : '',
                    network: networkEl ? networkEl.textContent.trim() : '',
                    genre: genreEl ? genreEl.textContent.trim() : '',
                    air_time: timeEl ? timeEl.textContent.trim() : '',
                    rating: ratingEl ? ratingEl.textContent.trim() : '',
                    summary: summaryEl ? summaryEl.textContent.trim() : '',
                });
            }
            return shows;
        }""")

        for item in shows_data[:request.max_results]:
            result.shows.append(TVGuideShowItem(**item))

        checkpoint(f"Extracted {len(result.shows)} shows")

    except Exception as e:
        result.error = str(e)
    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir()
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    from playwright.sync_api import sync_playwright
    pw = sync_playwright().start()
    browser = pw.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()

    try:
        request = TVGuideSearchRequest()
        result = tvguide_search(page, request)
        print(f"Found {len(result.shows)} shows")
        for i, s in enumerate(result.shows):
            print(f"  {i+1}. {s.show_title} on {s.network} ({s.genre}) - {s.air_time}")
        if result.error:
            print(f"Error: {result.error}")
    finally:
        browser.close()
        pw.stop()
        chrome_proc.terminate()
        shutil.rmtree(profile_dir, ignore_errors=True)


def run_with_debugger():
    test_func()


if __name__ == "__main__":
    run_with_debugger()
