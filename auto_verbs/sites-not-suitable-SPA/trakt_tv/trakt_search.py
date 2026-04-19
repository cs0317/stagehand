import os
import sys
import shutil
from dataclasses import dataclass, field
from typing import List

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class TraktSearchRequest:
    search_query: str = "breaking bad"
    max_results: int = 5


@dataclass
class TraktMediaItem:
    title: str = ""
    year: str = ""
    type: str = ""
    rating: str = ""
    num_votes: str = ""
    runtime: str = ""
    genres: str = ""
    overview: str = ""


@dataclass
class TraktSearchResult:
    media: List[TraktMediaItem] = field(default_factory=list)
    error: str = ""


def trakt_search(page, request: TraktSearchRequest) -> TraktSearchResult:
    result = TraktSearchResult()
    try:
        url = f"https://trakt.tv/search/shows?query={request.search_query}"
        page.goto(url, wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(3000)

        checkpoint("Search results loaded")

        media_data = page.evaluate("""(max) => {
            const links = document.querySelectorAll('a[href]');
            const items = [];
            const seen = new Set();
            for (const a of links) {
                if (items.length >= max) break;
                const href = a.getAttribute('href') || '';
                if (!href.match(/trakt\\.tv\\/(shows|movies)\\/[a-z0-9-]+$/)) continue;
                const text = a.textContent.trim();
                if (!text || text.length < 2 || text.length > 200) continue;
                if (seen.has(href)) continue;
                seen.add(href);
                items.push({title: text, year: '', type: '', rating: '', votes: '', runtime: '', genres: '', overview: ''});
            }
            return items;
        }""", request.max_results)

        for item in media_data:
            result.media.append(TraktMediaItem(**item))

        checkpoint(f"Extracted {len(result.media)} media items")

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
        request = TraktSearchRequest()
        result = trakt_search(page, request)
        print(f"Found {len(result.media)} media items")
        for i, m in enumerate(result.media):
            print(f"  {i+1}. {m.title} ({m.year}) [{m.type}] - {m.rating}")
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
