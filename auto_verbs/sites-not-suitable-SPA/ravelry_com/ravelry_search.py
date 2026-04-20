"""Playwright script (Python) — Ravelry Pattern Search"""
import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint

@dataclass(frozen=True)
class RavelryRequest:
    query: str = "scarf"
    max_results: int = 5

@dataclass
class PatternItem:
    name: str = ""
    designer: str = ""
    difficulty: str = ""
    yarn_weight: str = ""
    projects: str = ""

@dataclass
class RavelryResult:
    patterns: List[PatternItem] = field(default_factory=list)

def search_ravelry(page: Page, request: RavelryRequest) -> RavelryResult:
    url = f"https://www.ravelry.com/patterns/search#query={request.query}&craft=knitting&sort=best"
    checkpoint("Navigate to Ravelry search")
    page.goto(url, wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(8000)
    result = RavelryResult()
    js_code = """(max) => {
        const results = [];
        const cards = document.querySelectorAll('.pattern_search_results li, [class*="pattern"]');
        for (const card of cards) {
            if (results.length >= max) break;
            const nameEl = card.querySelector('a.pattern-link, [class*="title"] a, h3 a');
            const name = nameEl ? nameEl.textContent.trim() : '';
            if (!name) continue;
            const designerEl = card.querySelector('[class*="designer"] a, small a');
            const designer = designerEl ? designerEl.textContent.trim() : '';
            results.push({ name, designer, difficulty: '', yarn_weight: '', projects: '' });
        }
        return results;
    }"""
    for d in page.evaluate(js_code, request.max_results):
        item = PatternItem()
        item.name = d.get("name", "")
        item.designer = d.get("designer", "")
        result.patterns.append(item)
    print(f"Found {len(result.patterns)} patterns")
    return result

def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("ravelry")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            search_ravelry(page, RavelryRequest())
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)

if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
