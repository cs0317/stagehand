"""
Playwright script (Python) — DealNews Browse
Browse deals by category on DealNews.
"""

import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class DealNewsBrowseRequest:
    category: str = "electronics"
    max_results: int = 5


@dataclass
class DealItem:
    product_name: str = ""
    store: str = ""
    sale_price: str = ""
    original_price: str = ""
    editors_rating: str = ""


@dataclass
class DealNewsBrowseResult:
    category: str = ""
    items: List[DealItem] = field(default_factory=list)


def browse_dealnews(page: Page, request: DealNewsBrowseRequest) -> DealNewsBrowseResult:
    """Browse DealNews for deals by category."""
    # Map category names to DealNews category IDs
    category_map = {
        "electronics": "c142/Electronics",
        "computers": "c141/Computers",
        "clothing": "c440/Clothing-Accessories",
        "home": "c144/Home-Garden",
        "automotive": "c506/Automotive",
    }
    cat_path = category_map.get(request.category.lower(), f"c142/{request.category}")
    url = f"https://www.dealnews.com/{cat_path}/"
    print(f"Loading {url}...")
    checkpoint("Navigate to deals")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(6000)

    result = DealNewsBrowseResult(category=request.category)

    checkpoint("Extract deals")
    js_code = """(max) => {
        const items = [];
        const deals = document.querySelectorAll('[class*="deal"], [class*="content-card"], article, [class*="listing"]');
        for (const deal of deals) {
            if (items.length >= max) break;
            const text = (deal.textContent || '').replace(/\\s+/g, ' ').trim();

            let name = '';
            const nameEl = deal.querySelector('h2 a, h3 a, a h2, a h3, [class*="title"] a, a[class*="title"], [class*="headline"] a');
            if (nameEl) name = nameEl.textContent.trim();
            if (!name || name.length < 5 || name.length > 300) continue;
            if (items.some(i => i.product_name === name)) continue;

            let store = '';
            const storeEl = deal.querySelector('[class*="store"], [class*="merchant"], [class*="retailer"]');
            if (storeEl) store = storeEl.textContent.trim();

            let salePrice = '';
            const priceMatch = text.match(/\\$([\\d,.]+)/);
            if (priceMatch) salePrice = '$' + priceMatch[1];

            let origPrice = '';
            const origMatch = text.match(/(?:was|orig|list|reg).*?\\$([\\d,.]+)/i);
            if (origMatch) origPrice = '$' + origMatch[1];

            let rating = '';
            const ratingEl = deal.querySelector('[class*="rating"], [class*="score"], [class*="badge"]');
            if (ratingEl) rating = ratingEl.textContent.trim();

            items.push({product_name: name, store: store, sale_price: salePrice, original_price: origPrice, editors_rating: rating});
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = DealItem()
        item.product_name = d.get("product_name", "")
        item.store = d.get("store", "")
        item.sale_price = d.get("sale_price", "")
        item.original_price = d.get("original_price", "")
        item.editors_rating = d.get("editors_rating", "")
        result.items.append(item)

    print(f"\nFound {len(result.items)} deals in '{request.category}':")
    for i, item in enumerate(result.items, 1):
        print(f"\n  {i}. {item.product_name}")
        print(f"     Store: {item.store}  Price: {item.sale_price} (was {item.original_price})")
        print(f"     Rating: {item.editors_rating}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("dealnews")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            result = browse_dealnews(page, DealNewsBrowseRequest())
            print("\n=== DONE ===")
            print(f"Found {len(result.items)} deals")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
