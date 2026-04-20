"""
Playwright script (Python) — MasterClass Cooking Classes
Browse MasterClass cooking category and extract class details.
"""

import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class MasterClassRequest:
    category: str = "cooking"
    max_results: int = 5


@dataclass
class ClassItem:
    instructor: str = ""
    title: str = ""
    lessons: str = ""
    runtime: str = ""
    description: str = ""


@dataclass
class MasterClassResult:
    category: str = ""
    classes: List[ClassItem] = field(default_factory=list)


# Browses MasterClass cooking category and extracts class details
# including instructor, title, lessons, runtime, and description.
def browse_masterclass_cooking(page: Page, request: MasterClassRequest) -> MasterClassResult:
    url = f"https://www.masterclass.com/categories/{request.category}"
    print(f"Loading {url}...")
    checkpoint("Navigate to MasterClass category")
    page.goto(url, wait_until="domcontentloaded", timeout=45000)
    page.wait_for_timeout(10000)

    result = MasterClassResult(category=request.category)

    checkpoint("Extract class listings")
    js_code = """(max) => {
        const results = [];
        const cards = document.querySelectorAll('[class*="card"], [class*="class"], article, a[href*="/classes/"]');
        const seen = new Set();
        for (const card of cards) {
            if (results.length >= max) break;
            const text = card.textContent.trim();
            if (text.length < 10) continue;
            const lines = text.split('\\n').map(l => l.trim()).filter(l => l.length > 2);
            if (lines.length < 1) continue;
            const title = lines[0];
            if (seen.has(title) || title.length < 3) continue;
            seen.add(title);

            let instructor = lines.length > 1 ? lines[1] : '';
            let lessons = '';
            let runtime = '';
            let description = '';
            for (const line of lines) {
                if (/\\d+\\s*lessons?/i.test(line)) lessons = line;
                if (/\\d+\\s*(?:hr|min|hour)/i.test(line)) runtime = line;
                if (line.length > 40 && !description) description = line.substring(0, 200);
            }

            results.push({ instructor, title, lessons, runtime, description });
        }
        return results;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = ClassItem()
        item.instructor = d.get("instructor", "")
        item.title = d.get("title", "")
        item.lessons = d.get("lessons", "")
        item.runtime = d.get("runtime", "")
        item.description = d.get("description", "")
        result.classes.append(item)

    print(f"\nFound {len(result.classes)} classes in '{request.category}':")
    for i, item in enumerate(result.classes, 1):
        print(f"\n  {i}. {item.instructor}: {item.title}")
        print(f"     Lessons: {item.lessons}  Runtime: {item.runtime}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("masterclass")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            result = browse_masterclass_cooking(page, MasterClassRequest())
            print("\n=== DONE ===")
            print(f"Found {len(result.classes)} classes")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
