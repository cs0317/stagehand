"""
Playwright script (Python) — FlexJobs Remote Job Search
Search for remote jobs on FlexJobs.com.
"""

import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class FlexJobsSearchRequest:
    search_query: str = "UX designer"
    max_results: int = 5


@dataclass
class JobItem:
    title: str = ""
    company: str = ""
    job_type: str = ""
    flexibility: str = ""
    location: str = ""


@dataclass
class FlexJobsSearchResult:
    query: str = ""
    items: List[JobItem] = field(default_factory=list)


# Searches FlexJobs.com for remote jobs matching the query and returns
# up to max_results listings with title, company, job type, flexibility, and location.
def search_flexjobs(page: Page, request: FlexJobsSearchRequest) -> FlexJobsSearchResult:
    import urllib.parse
    url = f"https://www.flexjobs.com/search?search={urllib.parse.quote_plus(request.search_query)}&tele_level%5B%5D=All+Telecommuting"
    print(f"Loading {url}...")
    checkpoint("Navigate to search results")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    result = FlexJobsSearchResult(query=request.search_query)

    checkpoint("Extract job listings")
    js_code = """(max) => {
        const results = [];
        const cards = document.querySelectorAll('[class*="job-listing"], [class*="job-card"], article, li[class*="job"], [class*="search-result"]');
        for (const card of cards) {
            if (results.length >= max) break;
            const titleEl = card.querySelector('h2, h3, a[class*="title"], [class*="job-title"], [class*="job-name"]');
            const title = titleEl ? titleEl.textContent.trim() : '';
            if (!title || title.length < 5) continue;
            if (results.some(r => r.title === title)) continue;

            const text = (card.textContent || '').replace(/\\s+/g, ' ').trim();

            let company = '';
            const compEl = card.querySelector('[class*="company"], [class*="employer"]');
            if (compEl) company = compEl.textContent.trim();

            let jobType = '';
            const jtMatch = text.match(/(full[- ]time|part[- ]time|contract|freelance|temporary)/i);
            if (jtMatch) jobType = jtMatch[0];

            let flexibility = '';
            const flexMatch = text.match(/(remote|hybrid|work from home|telecommute|100% remote)/i);
            if (flexMatch) flexibility = flexMatch[0];

            let location = '';
            const locEl = card.querySelector('[class*="location"], [class*="place"]');
            if (locEl) location = locEl.textContent.trim();

            results.push({ title, company, job_type: jobType, flexibility, location });
        }
        return results;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = JobItem()
        item.title = d.get("title", "")
        item.company = d.get("company", "")
        item.job_type = d.get("job_type", "")
        item.flexibility = d.get("flexibility", "")
        item.location = d.get("location", "")
        result.items.append(item)

    print(f"\nFound {len(result.items)} jobs for '{request.search_query}':")
    for i, item in enumerate(result.items, 1):
        print(f"\n  {i}. {item.title}")
        print(f"     Company: {item.company}  Type: {item.job_type}")
        print(f"     Flexibility: {item.flexibility}  Location: {item.location}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("flexjobs")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            result = search_flexjobs(page, FlexJobsSearchRequest())
            print("\n=== DONE ===")
            print(f"Found {len(result.items)} jobs")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
