"""
Playwright script (Python) — Notion Templates
Browse Notion templates for project management.
"""

import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class NotionRequest:
    category: str = "project management"
    max_results: int = 5


@dataclass
class TemplateItem:
    name: str = ""
    creator: str = ""
    category: str = ""
    description: str = ""


@dataclass
class NotionResult:
    templates: List[TemplateItem] = field(default_factory=list)


# Browses Notion templates and extracts template name,
# creator, category, and description.
def get_notion_templates(page: Page, request: NotionRequest) -> NotionResult:
    url = "https://www.notion.so/templates/category/project-management"
    print(f"Loading {url}...")
    checkpoint("Navigate to Notion templates")
    page.goto(url, wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(8000)

    result = NotionResult()

    checkpoint("Extract templates")
    js_code = """(max) => {
        const results = [];
        const cards = document.querySelectorAll('[class*="templateCard"], [class*="gallery"] a, [class*="card"]');
        for (const card of cards) {
            if (results.length >= max) break;
            const nameEl = card.querySelector('h3, h2, [class*="title"], [class*="name"]');
            const name = nameEl ? nameEl.textContent.trim() : '';
            if (!name || name.length < 3) continue;

            const creatorEl = card.querySelector('[class*="author"], [class*="creator"], [class*="by"]');
            const creator = creatorEl ? creatorEl.textContent.trim().replace(/^by\\s*/i, '') : '';

            const descEl = card.querySelector('p, [class*="desc"]');
            const description = descEl ? descEl.textContent.trim().substring(0, 200) : '';

            results.push({ name, creator, category: 'Project Management', description });
        }
        return results;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = TemplateItem()
        item.name = d.get("name", "")
        item.creator = d.get("creator", "")
        item.category = d.get("category", "")
        item.description = d.get("description", "")
        result.templates.append(item)

    print(f"\nFound {len(result.templates)} templates:")
    for i, t in enumerate(result.templates, 1):
        print(f"\n  {i}. {t.name}")
        print(f"     Creator: {t.creator}  Category: {t.category}")
        print(f"     {t.description[:80]}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("notion")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            result = get_notion_templates(page, NotionRequest())
            print("\n=== DONE ===")
            print(f"Found {len(result.templates)} templates")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
