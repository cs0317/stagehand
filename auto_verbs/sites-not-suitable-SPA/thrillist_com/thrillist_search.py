import os
import sys
import shutil
from dataclasses import dataclass, field
from typing import List

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class ThrillistSearchRequest:
    search_query: str = "best bars"
    max_results: int = 5


@dataclass
class ThrillistArticleItem:
    title: str = ""
    author: str = ""
    publish_date: str = ""
    category: str = ""
    summary: str = ""


@dataclass
class ThrillistSearchResult:
    articles: List[ThrillistArticleItem] = field(default_factory=list)
    error: str = ""


def thrillist_search(page, request: ThrillistSearchRequest) -> ThrillistSearchResult:
    result = ThrillistSearchResult()
    try:
        url = f"https://www.thrillist.com/eat/nation"
        page.goto(url, wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(3000)

        checkpoint("Search results loaded")

        articles_data = page.evaluate("""(max) => {
            const links = document.querySelectorAll('a[href]');
            const items = [];
            const seen = new Set();
            for (const a of links) {
                if (items.length >= max) break;
                const href = a.getAttribute('href') || '';
                if (!href.match(/thrillist\\.com\\/(eat|drink|travel|entertainment|news|lifestyle)\\//)) continue;
                const text = a.textContent.trim();
                if (!text || text.length < 15 || text.length > 200) continue;
                if (seen.has(href)) continue;
                seen.add(href);
                items.push({title: text, author: '', publish_date: '', category: '', summary: ''});
            }
            return items;
        }""", request.max_results)

        for item in articles_data:
            result.articles.append(ThrillistArticleItem(**item))

        checkpoint(f"Extracted {len(result.articles)} articles")

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
        request = ThrillistSearchRequest()
        result = thrillist_search(page, request)
        print(f"Found {len(result.articles)} articles")
        for i, a in enumerate(result.articles):
            print(f"  {i+1}. {a.title} by {a.author} ({a.publish_date})")
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
