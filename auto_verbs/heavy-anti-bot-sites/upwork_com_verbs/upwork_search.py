"""Playwright script (Python) — Upwork"""
import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint

@dataclass(frozen=True)
class UpworkRequest:
    query: str = "React development"
    max_results: int = 5

@dataclass
class FreelancerItem:
    name: str = ""
    title: str = ""
    rate: str = ""
    success: str = ""
    earnings: str = ""
    skills: str = ""

@dataclass
class UpworkResult:
    freelancers: List[FreelancerItem] = field(default_factory=list)

def search_upwork(page: Page, request: UpworkRequest) -> UpworkResult:
    url = f"https://www.upwork.com/search/profiles/?q={request.query.replace(' ', '+')}"
    checkpoint("Navigate to Upwork search")
    page.goto(url, wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(8000)
    result = UpworkResult()
    js_code = """(max) => {
        const results = [];
        const cards = document.querySelectorAll('[class*="freelancer"], [class*="profile-card"], section[data-test*="profile"]');
        for (const card of cards) {
            if (results.length >= max) break;
            const nameEl = card.querySelector('[class*="name"], h4, h3');
            const name = nameEl ? nameEl.textContent.trim() : '';
            if (!name) continue;
            const titleEl = card.querySelector('[class*="title"], [class*="headline"]');
            const title = titleEl ? titleEl.textContent.trim() : '';
            const rateEl = card.querySelector('[class*="rate"], [class*="price"]');
            const rate = rateEl ? rateEl.textContent.trim() : '';
            results.push({ name, title, rate, success: '', earnings: '', skills: '' });
        }
        return results;
    }"""
    for d in page.evaluate(js_code, request.max_results):
        item = FreelancerItem()
        item.name = d.get("name", "")
        item.title = d.get("title", "")
        item.rate = d.get("rate", "")
        result.freelancers.append(item)
    print(f"Found {len(result.freelancers)} freelancers")
    return result

def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("upwork")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            search_upwork(page, UpworkRequest())
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)

if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
