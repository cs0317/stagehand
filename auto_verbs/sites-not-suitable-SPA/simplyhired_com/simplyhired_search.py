"""Playwright script (Python) — SimplyHired"""
import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint

@dataclass(frozen=True)
class SimplyHiredRequest:
    query: str = "product manager"
    location: str = "San Francisco, CA"
    max_results: int = 5

@dataclass
class JobItem:
    title: str = ""
    company: str = ""
    location: str = ""
    salary: str = ""
    description: str = ""

@dataclass
class SimplyHiredResult:
    jobs: List[JobItem] = field(default_factory=list)

def search_simplyhired(page: Page, request: SimplyHiredRequest) -> SimplyHiredResult:
    url = f"https://www.simplyhired.com/search?q={request.query.replace(' ', '+')}&l={request.location.replace(' ', '+')}"
    checkpoint("Navigate to SimplyHired search")
    page.goto(url, wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(5000)
    result = SimplyHiredResult()
    js_code = """(max) => {
        const results = [];
        const seen = new Set();
        // SimplyHired uses H2 elements for job titles
        const h2s = document.querySelectorAll('h2');
        for (const h2 of h2s) {
            if (results.length >= max) break;
            const title = h2.innerText.trim();
            if (!title || title.length < 5 || seen.has(title)) continue;
            // Skip nav/UI headings
            if (title.match(/^(Refine|Filter|Search|Sign|Log|Menu|Sort|Privacy)/i)) continue;
            seen.add(title);

            const container = h2.closest('div, li, article') || h2.parentElement;
            const text = container ? container.innerText : '';
            const lines = text.split('\\n').map(l => l.trim()).filter(l => l.length > 0);

            // Company is often after title
            let company = '';
            let location = '';
            for (const line of lines) {
                if (line === title) continue;
                if (!company && line.length > 2 && !line.match(/^(\\$|Apply|Save|Estimated|Posted|Full|Part)/i)) {
                    company = line;
                } else if (company && !location && line.match(/,\\s*[A-Z]{2}|Remote/)) {
                    location = line;
                }
            }

            const salaryMatch = text.match(/(\\$[\\d,.]+ ?-? ?\\$?[\\d,.]*\\s*(?:an hour|a year|per|annually|yearly)?)/i);
            const salary = salaryMatch ? salaryMatch[1] : '';

            results.push({ title, company, location, salary, description: '' });
        }
        return results;
    }"""
    for d in page.evaluate(js_code, request.max_results):
        item = JobItem()
        item.title = d.get("title", "")
        item.company = d.get("company", "")
        item.location = d.get("location", "")
        item.salary = d.get("salary", "")
        item.description = d.get("description", "")
        result.jobs.append(item)
    print(f"Found {len(result.jobs)} jobs")
    return result

def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("simplyhired")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            search_simplyhired(page, SimplyHiredRequest())
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)

if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
