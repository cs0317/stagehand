"""
Playwright script (Python) — Newspapers.com Historical Search
Search Newspapers.com for historical newspaper articles.
"""

import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class NewspapersRequest:
    query: str = "moon landing 1969"
    max_results: int = 5


@dataclass
class ResultItem:
    newspaper: str = ""
    date: str = ""
    headline: str = ""
    location: str = ""
    snippet: str = ""


@dataclass
class NewspapersResult:
    results: List[ResultItem] = field(default_factory=list)


# Searches Newspapers.com for historical articles and extracts
# newspaper name, date, headline, location, and snippet.
def search_newspapers(page: Page, request: NewspapersRequest) -> NewspapersResult:
    url = f"https://www.newspapers.com/search/?query={request.query.replace(' ', '+')}"
    print(f"Loading {url}...")
    checkpoint("Navigate to Newspapers.com search")
    page.goto(url, wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(5000)

    result = NewspapersResult()

    checkpoint("Extract search results")
    js_code = """(max) => {
        const results = [];
        const items = document.querySelectorAll('[class*="result"], [class*="clip"], article');
        for (const item of items) {
            if (results.length >= max) break;
            const text = item.textContent.trim();
            if (text.length < 20) continue;

            const titleEl = item.querySelector('h2, h3, [class*="title"], a');
            const headline = titleEl ? titleEl.textContent.trim() : '';
            if (!headline) continue;

            const lines = text.split('\\n').map(l => l.trim()).filter(l => l.length > 2);
            let newspaper = '', date = '', location = '', snippet = '';
            for (const line of lines) {
                if (/\\d{4}/.test(line) && /\\d{1,2}/.test(line) && !date) date = line;
                if (line.length > 50 && !snippet) snippet = line.substring(0, 200);
            }

            results.push({ newspaper, date, headline: headline.substring(0, 200), location, snippet });
        }
        return results;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = ResultItem()
        item.newspaper = d.get("newspaper", "")
        item.date = d.get("date", "")
        item.headline = d.get("headline", "")
        item.location = d.get("location", "")
        item.snippet = d.get("snippet", "")
        result.results.append(item)

    print(f"\nFound {len(result.results)} results:")
    for i, r in enumerate(result.results, 1):
        print(f"\n  {i}. {r.headline}")
        print(f"     Newspaper: {r.newspaper}  Date: {r.date}")
        print(f"     Location: {r.location}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("newspapers")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            result = search_newspapers(page, NewspapersRequest())
            print("\n=== DONE ===")
            print(f"Found {len(result.results)} results")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
