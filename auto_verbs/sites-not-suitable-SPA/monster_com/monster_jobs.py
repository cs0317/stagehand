"""
Playwright script (Python) — Monster Job Search
Search Monster for job listings.
"""

import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class MonsterRequest:
    query: str = "software engineer"
    location: str = "Seattle, WA"
    max_results: int = 5


@dataclass
class JobItem:
    title: str = ""
    company: str = ""
    location: str = ""
    salary: str = ""
    date: str = ""


@dataclass
class MonsterResult:
    jobs: List[JobItem] = field(default_factory=list)


# Searches Monster for job listings and extracts job title,
# company, location, salary range, and post date.
def search_monster_jobs(page: Page, request: MonsterRequest) -> MonsterResult:
    url = f"https://www.monster.com/jobs/search?q={request.query.replace(' ', '+')}&where={request.location.replace(' ', '+')}"
    print(f"Loading {url}...")
    checkpoint("Navigate to Monster job search")
    page.goto(url, wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(10000)
    page.evaluate("window.scrollBy(0, 1000)")
    page.wait_for_timeout(3000)

    result = MonsterResult()

    checkpoint("Extract job listings")
    js_code = """(max) => {
        const results = [];
        const cards = document.querySelectorAll('[data-testid="svx-job-card"], [class*="job-card"], article, [role="listitem"]');
        for (const card of cards) {
            if (results.length >= max) break;
            const titleEl = card.querySelector('h2 a, h3 a, [data-testid="jobTitle"], [class*="title"] a');
            const title = titleEl ? titleEl.textContent.trim() : '';
            if (!title || title.length < 5) continue;

            const companyEl = card.querySelector('[data-testid="company"], [class*="company"]');
            const company = companyEl ? companyEl.textContent.trim() : '';

            const locEl = card.querySelector('[data-testid="location"], [class*="location"]');
            const location = locEl ? locEl.textContent.trim() : '';

            const salaryEl = card.querySelector('[data-testid="salary"], [class*="salary"]');
            const salary = salaryEl ? salaryEl.textContent.trim() : '';

            const dateEl = card.querySelector('[data-testid="posted"], time, [class*="date"]');
            const date = dateEl ? dateEl.textContent.trim() : '';

            results.push({ title, company, location, salary, date });
        }
        return results;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = JobItem()
        item.title = d.get("title", "")
        item.company = d.get("company", "")
        item.location = d.get("location", "")
        item.salary = d.get("salary", "")
        item.date = d.get("date", "")
        result.jobs.append(item)

    print(f"\nFound {len(result.jobs)} jobs:")
    for i, j in enumerate(result.jobs, 1):
        print(f"\n  {i}. {j.title}")
        print(f"     Company: {j.company}  Location: {j.location}")
        print(f"     Salary: {j.salary}  Posted: {j.date}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("monster")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            result = search_monster_jobs(page, MonsterRequest())
            print("\n=== DONE ===")
            print(f"Found {len(result.jobs)} jobs")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
