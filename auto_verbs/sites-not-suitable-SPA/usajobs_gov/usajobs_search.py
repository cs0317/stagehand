"""Playwright script (Python) — USAJobs"""
import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint

@dataclass(frozen=True)
class USAJobsRequest:
    query: str = "information technology"
    location: str = "Washington, DC"
    max_results: int = 5

@dataclass
class JobItem:
    title: str = ""
    agency: str = ""
    salary: str = ""
    grade: str = ""
    closing: str = ""

@dataclass
class USAJobsResult:
    jobs: List[JobItem] = field(default_factory=list)

def search_usajobs(page: Page, request: USAJobsRequest) -> USAJobsResult:
    url = f"https://www.usajobs.gov/Search/Results?k={request.query.replace(' ', '+')}"
    checkpoint("Navigate to USAJobs search")
    page.goto(url, wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(8000)
    result = USAJobsResult()
    js_code = """(max) => {
        const results = [];
        const seen = new Set();
        const h2s = document.querySelectorAll('h2');
        for (const h2 of h2s) {
            if (results.length >= max) break;
            const title = h2.innerText.trim();
            if (!title || title.length < 5 || seen.has(title)) continue;
            if (title.match(/^(Please|No jobs|Discover|Search|Filter|Sort|Privacy|Cookie|Other|Sign|Menu)/i)) continue;
            seen.add(title);

            const container = h2.closest('div, li, article') || h2.parentElement;
            const text = container ? container.innerText : '';
            const lines = text.split('\\n').map(l => l.trim()).filter(l => l.length > 0);

            let agency = '';
            let salary = '';
            for (const line of lines) {
                if (line === title) continue;
                if (!agency && line.length > 3 && !line.match(/^(Open|Closing|Save|Apply|\\$)/i)) agency = line;
                if (line.match(/^\\$[\\d,]+/)) salary = line;
            }
            results.push({ title, agency, salary, grade: '', closing: '' });
        }
        return results;
    }"""
    for d in page.evaluate(js_code, request.max_results):
        item = JobItem()
        item.title = d.get("title", "")
        item.agency = d.get("agency", "")
        item.salary = d.get("salary", "")
        item.grade = d.get("grade", "")
        item.closing = d.get("closing", "")
        result.jobs.append(item)
    print(f"Found {len(result.jobs)} jobs")
    return result

def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("usajobs")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            search_usajobs(page, USAJobsRequest())
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)

if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
