"""
Playwright script (Python) — Product Hunt Today
Browse today's top product launches.
"""

import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class ProductHuntRequest:
    max_results: int = 5


@dataclass
class ProductItem:
    name: str = ""
    tagline: str = ""
    upvotes: str = ""
    comments: str = ""
    maker: str = ""


@dataclass
class ProductHuntResult:
    products: List[ProductItem] = field(default_factory=list)


# Browses today's Product Hunt launches and extracts product name,
# tagline, upvote count, comment count, and maker name.
def get_producthunt_today(page: Page, request: ProductHuntRequest) -> ProductHuntResult:
    url = "https://www.producthunt.com/"
    print(f"Loading {url}...")
    checkpoint("Navigate to Product Hunt")
    page.goto(url, wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(8000)

    result = ProductHuntResult()

    checkpoint("Extract product listings")
    js_code = """(max) => {
        const results = [];
        const items = document.querySelectorAll('[data-test*="post"], [class*="item"], [class*="post"]');
        for (const item of items) {
            if (results.length >= max) break;
            const nameEl = item.querySelector('h3, [data-test*="name"], a[href*="/posts/"]');
            const name = nameEl ? nameEl.textContent.trim() : '';
            if (!name || name.length < 2) continue;

            const taglineEl = item.querySelector('p, [class*="tagline"]');
            const tagline = taglineEl ? taglineEl.textContent.trim() : '';

            const voteEl = item.querySelector('[class*="vote"], button[class*="upvote"]');
            const upvotes = voteEl ? voteEl.textContent.trim().replace(/[^0-9]/g, '') : '';

            const commentEl = item.querySelector('[class*="comment"]');
            const comments = commentEl ? commentEl.textContent.trim().replace(/[^0-9]/g, '') : '';

            results.push({ name, tagline, upvotes, comments, maker: '' });
        }
        return results;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = ProductItem()
        item.name = d.get("name", "")
        item.tagline = d.get("tagline", "")
        item.upvotes = d.get("upvotes", "")
        item.comments = d.get("comments", "")
        item.maker = d.get("maker", "")
        result.products.append(item)

    print(f"\nFound {len(result.products)} products:")
    for i, p in enumerate(result.products, 1):
        print(f"\n  {i}. {p.name}")
        print(f"     {p.tagline}")
        print(f"     Upvotes: {p.upvotes}  Comments: {p.comments}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("producthunt")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            result = get_producthunt_today(page, ProductHuntRequest())
            print("\n=== DONE ===")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
