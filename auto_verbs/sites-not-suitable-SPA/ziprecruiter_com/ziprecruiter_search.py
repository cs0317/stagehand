"""Playwright script (Python) — ZipRecruiter"""
import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint

@dataclass(frozen=True)
class ZipRecruiterRequest:
    query: str = "data analyst"
    location: str = "Denver, CO"
    max_results: int = 5

@dataclass
class JobItem:
    title: str = ""
    company: str = ""
    location: str = ""
    salary: str = ""
    posted: str = ""

@dataclass
class ZipRecruiterResult:
    jobs: List[JobItem] = field(default_factory=list)

def search_ziprecruiter(page: Page, request: ZipRecruiterRequest) -> ZipRecruiterResult:
    url = f"https://www.ziprecruiter.com/jobs-search?search={request.query.replace(' ', '+')}&location={request.location.replace(' ', '+')}"
    checkpoint("Navigate to ZipRecruiter search")
    page.goto(url, wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(8000)
    result = ZipRecruiterResult()
    js_code = """(max) => {
        const results = [];
        const cards = document.querySelectorAll('[class*="job_result"], [class*="job-listing"], article[class*="job"]');
        for (const card of cards) {
            if (results.length >= max) break;
            const titleEl = card.querySelector('[class*="title"], h2 a, a[class*="job"]');
            const title = titleEl ? titleEl.textContent.trim() : '';
            if (!title) continue;
            const companyEl = card.querySelector('[class*="company"], [class*="employer"]');
            const company = companyEl ? companyEl.textContent.trim() : '';
            const locEl = card.querySelector('[class*="location"]');
            const location = locEl ? locEl.textContent.trim() : '';
            const salaryEl = card.querySelector('[class*="salary"]');
            const salary = salaryEl ? salaryEl.textContent.trim() : '';
            const postedEl = card.querySelector('[class*="posted"], [class*="days"]');
            const posted = postedEl ? postedEl.textContent.trim() : '';
            results.push({ title, company, location, salary, posted });
        }
        return results;
    }"""
    for d in page.evaluate(js_code, request.max_results):
        item = JobItem()
        item.title = d.get("title", "")
        item.company = d.get("company", "")
        item.location = d.get("location", "")
        item.salary = d.get("salary", "")
        item.posted = d.get("posted", "")
        result.jobs.append(item)
    print(f"Found {len(result.jobs)} jobs")
    return result

def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("ziprecruiter")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            search_ziprecruiter(page, ZipRecruiterRequest())
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)

if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
