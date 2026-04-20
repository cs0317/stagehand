"""
Playwright script (Python) — OPM GS Pay Scale
Extract federal GS pay scale from OPM.gov.
"""

import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class OPMRequest:
    year: int = 2024


@dataclass
class GradeItem:
    grade: str = ""
    step1: str = ""
    step10: str = ""


@dataclass
class OPMResult:
    grades: List[GradeItem] = field(default_factory=list)


# Extracts the GS pay scale table with grade levels,
# Step 1 and Step 10 annual salaries.
def get_gs_payscale(page: Page, request: OPMRequest) -> OPMResult:
    url = f"https://www.opm.gov/policy-data-oversight/pay-leave/salaries-wages/{request.year}/general-schedule/"
    print(f"Loading {url}...")
    checkpoint("Navigate to OPM GS pay scale")
    page.goto(url, wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(5000)

    result = OPMResult()

    checkpoint("Extract pay scale table")
    js_code = """() => {
        const results = [];
        const rows = document.querySelectorAll('table tbody tr, table tr');
        for (const row of rows) {
            const cells = row.querySelectorAll('td');
            if (cells.length < 10) continue;
            const grade = cells[0].textContent.trim();
            if (!/^\\d+$/.test(grade) && !/^GS/i.test(grade)) continue;
            const step1 = cells[1] ? cells[1].textContent.trim() : '';
            const step10 = cells[10] ? cells[10].textContent.trim() : (cells[cells.length - 1] ? cells[cells.length - 1].textContent.trim() : '');
            results.push({ grade: 'GS-' + grade.replace(/^GS-?/i, ''), step1, step10 });
        }
        return results;
    }"""
    items_data = page.evaluate(js_code)

    for d in items_data:
        item = GradeItem()
        item.grade = d.get("grade", "")
        item.step1 = d.get("step1", "")
        item.step10 = d.get("step10", "")
        result.grades.append(item)

    print(f"\nFound {len(result.grades)} grades:")
    for g in result.grades:
        print(f"  {g.grade}: Step 1 = {g.step1}, Step 10 = {g.step10}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("opm")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            result = get_gs_payscale(page, OPMRequest())
            print("\n=== DONE ===")
            print(f"Found {len(result.grades)} grades")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
