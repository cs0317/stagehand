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
        url = f"https://www.tvguide.com/tvshows/"
        page.goto(url, wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(5000)

        checkpoint("Search results loaded")

        shows_data = page.evaluate("""(max) => {
            const results = [];
            const seen = new Set();
            const headings = document.querySelectorAll('h1, h2, h3, h4');
            for (const h of headings) {
                if (results.length >= max) break;
                const title = h.innerText.trim();
                if (!title || title.length < 10 || seen.has(title)) continue;
                if (title.match(/^(Live TV|TV and Movie|See Full|Subscribe|Sign|Menu|Search|Privacy|Cookie|Follow|About|Navigation)/i)) continue;
                seen.add(title);
                results.push({show_title: title, network: '', genre: '', air_time: '', rating: '', summary: ''});
            }
            return results;
        }""", request.max_results)

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
