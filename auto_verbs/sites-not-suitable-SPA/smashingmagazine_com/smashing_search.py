"""Playwright script (Python) — Smashing Magazine"""
import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint

@dataclass(frozen=True)
class SmashingRequest:
    query: str = "CSS Grid layout"
    max_results: int = 5

@dataclass
class ArticleItem:
    title: str = ""
    author: str = ""
    publish_date: str = ""
    category: str = ""
    summary: str = ""

@dataclass
class SmashingResult:
    articles: List[ArticleItem] = field(default_factory=list)

def search_smashing(page: Page, request: SmashingRequest) -> SmashingResult:
    url = f"https://www.smashingmagazine.com/search/?q={request.query.replace(' ', '+')}"
    checkpoint("Navigate to Smashing Magazine search")
    page.goto(url, wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(8000)
    result = SmashingResult()
    js_code = """(max) => {
        const results = [];
        const seen = new Set();
        // Smashing Magazine uses H2 for article titles
        const h2s = document.querySelectorAll('h2');
        for (const h2 of h2s) {
            if (results.length >= max) break;
            const title = h2.innerText.trim();
            if (!title || title.length < 10 || seen.has(title)) continue;
            // Skip nav/UI headings
            if (title.match(/^(Subscribe|Newsletter|Sign|Menu|Search|About|Community|Jobs|Advertise|Privacy|Cookie)/i)) continue;
            seen.add(title);

            const container = h2.closest('article, div, li') || h2.parentElement;
            const text = container ? container.innerText : '';

            const authorMatch = text.match(/by\\s+([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)+)/);
            const author = authorMatch ? authorMatch[1] : '';

            const dateMatch = text.match(/(\\w+\\.?\\s+\\d{1,2},?\\s+\\d{4})/);
            const publish_date = dateMatch ? dateMatch[1] : '';

            const catEl = container ? container.querySelector('[class*="cat"], [class*="tag"]') : null;
            const category = catEl ? catEl.innerText.trim() : '';

            const summaryEl = container ? container.querySelector('p') : null;
            const summary = summaryEl ? summaryEl.innerText.trim().substring(0, 200) : '';

            results.push({ title, author, publish_date, category, summary });
        }
        return results;
    }"""
    for d in page.evaluate(js_code, request.max_results):
        item = ArticleItem()
        item.title = d.get("title", "")
        item.author = d.get("author", "")
        item.publish_date = d.get("publish_date", "")
        item.category = d.get("category", "")
        item.summary = d.get("summary", "")
        result.articles.append(item)
    print(f"Found {len(result.articles)} articles")
    return result

def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("smashing")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            search_smashing(page, SmashingRequest())
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)

if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
