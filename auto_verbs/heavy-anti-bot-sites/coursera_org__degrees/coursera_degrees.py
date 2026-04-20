"""
Playwright script (Python) — Coursera Degrees
Browse online degree programs on Coursera.
"""

import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class CourseraDegreesRequest:
    field: str = "Computer Science"
    max_results: int = 5


@dataclass
class DegreeItem:
    name: str = ""
    university: str = ""
    degree_type: str = ""
    tuition: str = ""
    duration: str = ""


@dataclass
class CourseraDegreesResult:
    search_field: str = ""
    items: List[DegreeItem] = field(default_factory=list)


def browse_coursera_degrees(page: Page, request: CourseraDegreesRequest) -> CourseraDegreesResult:
    """Browse Coursera degree programs."""
    slug = request.field.lower().replace(" ", "-")
    url = f"https://www.coursera.org/degrees/{slug}"
    print(f"Loading {url}...")
    checkpoint("Navigate to degrees")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(6000)

    result = CourseraDegreesResult(search_field=request.field)

    checkpoint("Extract degree programs")
    js_code = """(max) => {
        const items = [];
        const cards = document.querySelectorAll('[class*="degree"], [class*="card"], [class*="product"], article');
        for (const card of cards) {
            if (items.length >= max) break;
            const text = (card.textContent || '').replace(/\\s+/g, ' ').trim();

            let name = '';
            const nameEl = card.querySelector('h2, h3, [class*="title"], [class*="name"]');
            if (nameEl) name = nameEl.textContent.trim();
            if (!name || name.length < 5 || name.length > 300) continue;
            if (items.some(i => i.name === name)) continue;

            let uni = '';
            const uniEl = card.querySelector('[class*="university"], [class*="partner"], [class*="institution"]');
            if (uniEl) uni = uniEl.textContent.trim();

            let degType = '';
            if (/master/i.test(text)) degType = "Master's";
            else if (/bachelor/i.test(text)) degType = "Bachelor's";
            else if (/doctorate|phd/i.test(text)) degType = "Doctorate";

            let tuition = '';
            const tuitionMatch = text.match(/\\$[\\d,]+/);
            if (tuitionMatch) tuition = tuitionMatch[0];

            let duration = '';
            const durMatch = text.match(/(\\d+[\\d-]*\\s*(?:year|month|week)s?)/i);
            if (durMatch) duration = durMatch[0];

            items.push({name: name, university: uni, degree_type: degType, tuition: tuition, duration: duration});
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = DegreeItem()
        item.name = d.get("name", "")
        item.university = d.get("university", "")
        item.degree_type = d.get("degree_type", "")
        item.tuition = d.get("tuition", "")
        item.duration = d.get("duration", "")
        result.items.append(item)

    print(f"\nFound {len(result.items)} degree programs in '{request.field}':")
    for i, item in enumerate(result.items, 1):
        print(f"\n  {i}. {item.name}")
        print(f"     University: {item.university}  Type: {item.degree_type}  Tuition: {item.tuition}  Duration: {item.duration}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("coursera_deg")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            result = browse_coursera_degrees(page, CourseraDegreesRequest())
            print("\n=== DONE ===")
            print(f"Found {len(result.items)} programs")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
