"""
Playwright script (Python) — Google News Search
Search Google News for articles on a topic.
"""

import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class GoogleNewsRequest:
    search_query: str = "artificial intelligence"
    max_results: int = 5


@dataclass
class NewsArticle:
    headline: str = ""
    source: str = ""
    time: str = ""
    snippet: str = ""


@dataclass
class GoogleNewsResult:
    query: str = ""
    items: List[NewsArticle] = field(default_factory=list)


# Searches Google News for articles matching the query and returns
# up to max_results articles with headline, source, publish time, and snippet.
def search_google_news(page: Page, request: GoogleNewsRequest) -> GoogleNewsResult:
    import urllib.parse
    url = f"https://news.google.com/search?q={urllib.parse.quote_plus(request.search_query)}"
    print(f"Loading {url}...")
    checkpoint("Navigate to news results")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    result = GoogleNewsResult(query=request.search_query)

    checkpoint("Extract news articles")
    js_code = """(max) => {
        const results = [];
        const articles = document.querySelectorAll('article, [class*="NiLAwe"], [class*="IBr9hb"], c-wiz article, [jscontroller] article');
        for (const art of articles) {
            if (results.length >= max) break;

            const headlineEl = art.querySelector('a[class*="JtKRv"], h3 a, h4 a, a[href*="./articles/"]');
            const headline = headlineEl ? headlineEl.textContent.trim() : '';
            if (!headline || headline.length < 5) continue;
            if (results.some(r => r.headline === headline)) continue;

            let source = '';
            const sourceEl = art.querySelector('[class*="vr1PYe"], [data-n-tid], [class*="source"], time + span, div[class*="SVJrMe"]');
            if (sourceEl) source = sourceEl.textContent.trim();

            let time = '';
            const timeEl = art.querySelector('time, [class*="WW6dff"], [datetime]');
            if (timeEl) time = timeEl.textContent.trim() || timeEl.getAttribute('datetime') || '';

            let snippet = '';
            const snippetEl = art.querySelector('[class*="xBbh9"], [class*="snippet"], p');
            if (snippetEl) snippet = snippetEl.textContent.trim().substring(0, 200);

            results.push({ headline, source, time, snippet });
        }
        return results;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = NewsArticle()
        item.headline = d.get("headline", "")
        item.source = d.get("source", "")
        item.time = d.get("time", "")
        item.snippet = d.get("snippet", "")
        result.items.append(item)

    print(f"\nFound {len(result.items)} articles for '{request.search_query}':")
    for i, item in enumerate(result.items, 1):
        print(f"\n  {i}. {item.headline}")
        print(f"     Source: {item.source}  Time: {item.time}")
        if item.snippet:
            print(f"     {item.snippet[:100]}...")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("gnews")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            result = search_google_news(page, GoogleNewsRequest())
            print("\n=== DONE ===")
            print(f"Found {len(result.items)} articles")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
