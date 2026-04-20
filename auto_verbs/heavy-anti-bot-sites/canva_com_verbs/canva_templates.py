"""
Playwright script (Python) — Canva Templates
Browse design templates on Canva.
"""

import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from urllib.parse import quote_plus
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class CanvaTemplatesRequest:
    query: str = "Instagram posts"
    max_results: int = 5


@dataclass
class TemplateItem:
    name: str = ""
    category: str = ""
    dimensions: str = ""
    is_free: str = ""


@dataclass
class CanvaTemplatesResult:
    query: str = ""
    items: List[TemplateItem] = field(default_factory=list)


def browse_canva_templates(page: Page, request: CanvaTemplatesRequest) -> CanvaTemplatesResult:
    """Browse Canva templates by query."""
    encoded = quote_plus(request.query)
    url = f"https://www.canva.com/templates/?query={encoded}"
    print(f"Loading {url}...")
    checkpoint("Navigate to templates")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(6000)

    result = CanvaTemplatesResult(query=request.query)

    checkpoint("Extract templates")
    js_code = """(max) => {
        const items = [];
        const cards = document.querySelectorAll('[class*="template"], [class*="card"], [class*="TemplateCard"], [role="listitem"]');
        for (const card of cards) {
            if (items.length >= max) break;
            const text = (card.textContent || '').replace(/\\s+/g, ' ').trim();

            let name = '';
            const nameEl = card.querySelector('[class*="title"], h3, h4, [aria-label]');
            if (nameEl) name = (nameEl.getAttribute('aria-label') || nameEl.textContent).trim();
            if (!name || name.length < 3 || name.length > 300) continue;
            if (items.some(i => i.name === name)) continue;

            let category = '';
            const catEl = card.querySelector('[class*="category"], [class*="tag"]');
            if (catEl) category = catEl.textContent.trim();

            let dimensions = '';
            const dimMatch = text.match(/(\\d+\\s*[x×]\\s*\\d+\\s*(?:px|in|cm)?)/i);
            if (dimMatch) dimensions = dimMatch[1];

            let isFree = text.toLowerCase().includes('free') ? 'Free' : (text.toLowerCase().includes('pro') || text.toLowerCase().includes('premium') ? 'Premium' : '');

            items.push({name: name, category: category, dimensions: dimensions, is_free: isFree});
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = TemplateItem()
        item.name = d.get("name", "")
        item.category = d.get("category", "")
        item.dimensions = d.get("dimensions", "")
        item.is_free = d.get("is_free", "")
        result.items.append(item)

    print(f"\nFound {len(result.items)} templates for '{request.query}':")
    for i, item in enumerate(result.items, 1):
        print(f"\n  {i}. {item.name}")
        print(f"     Category: {item.category}  Dimensions: {item.dimensions}  Free: {item.is_free}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("canva")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            result = browse_canva_templates(page, CanvaTemplatesRequest())
            print("\n=== DONE ===")
            print(f"Found {len(result.items)} templates")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
