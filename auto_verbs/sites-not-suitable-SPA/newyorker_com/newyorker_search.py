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
class NewyorkerSearchRequest:
    search_query: str = "technology"
    max_results: int = 5


@dataclass
class NewyorkerSearchItem:
    title: str = ""
    author: str = ""
    publish_date: str = ""
    section: str = ""
    summary: str = ""


@dataclass
class NewyorkerSearchResult:
    items: List[NewyorkerSearchItem] = field(default_factory=list)


def newyorker_search(page, request: NewyorkerSearchRequest) -> NewyorkerSearchResult:
    url = f"https://www.newyorker.com/search?q={request.search_query.replace(' ', '+')}&sort=relevance"
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(8000)

    items = page.evaluate("""(max) => {
        const results = [];
        const seen = new Set();
        // New Yorker search results use H2 elements for article titles
        const h2s = document.querySelectorAll('h2');
        for (const h2 of h2s) {
            if (results.length >= max) break;
            const title = h2.innerText.trim();
            if (!title || title.length < 10 || seen.has(title)) continue;
            // Skip nav/UI headings
            if (title.match(/^(Sign|Subscribe|Newsletter|Privacy|Menu|Search)/i)) continue;
            seen.add(title);

            // Look for author/date/section in surrounding container
            const container = h2.closest('div') || h2.parentElement;
            const text = container ? container.innerText : '';

            const authorMatch = text.match(/by\\s+([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)+)/);
            const author = authorMatch ? authorMatch[1] : '';

            const dateMatch = text.match(/(\\w+\\.?\\s+\\d{1,2},?\\s+\\d{4})/);
            const publish_date = dateMatch ? dateMatch[1] : '';

            // Try to find section from link
            const link = container ? container.querySelector('a[href]') : null;
            const href = link ? (link.getAttribute('href') || '') : '';
            const sectionMatch = href.match(/^\\/(\\w+)\\//);
            const section = sectionMatch ? sectionMatch[1] : '';

            results.push({ title, author, publish_date, section, summary: '' });
        }
        return results;
    }""", request.max_results)

    result = NewyorkerSearchResult()
    for item in items[: request.max_results]:
        result.items.append(
            NewyorkerSearchItem(
                title=item.get("title", ""),
                author=item.get("author", ""),
                publish_date=item.get("publish_date", ""),
                section=item.get("section", ""),
                summary=item.get("summary", ""),
            )
        )

    checkpoint("newyorker_search result")
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
        request = NewyorkerSearchRequest(search_query="technology", max_results=5)
        result = newyorker_search(page, request)
        print(f"Found {len(result.items)} articles")
        for i, item in enumerate(result.items):
            print(f"  {i+1}. {item.title} by {item.author} ({item.publish_date})")
            print(f"     Section: {item.section}")
            print(f"     {item.summary[:100]}...")
    finally:
        browser.close()
        pw.stop()
        chrome_process.terminate()
        shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger

    run_with_debugger(test_func)
