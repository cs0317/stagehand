"""
Playwright script (Python) — CarGurus Search
Search for used cars on CarGurus.
"""

import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class CarGurusSearchRequest:
    make: str = "Tesla"
    model: str = "Model 3"
    zip_code: str = "10001"
    max_results: int = 5


@dataclass
class CarItem:
    year: str = ""
    trim: str = ""
    mileage: str = ""
    price: str = ""
    deal_rating: str = ""
    seller_name: str = ""


@dataclass
class CarGurusSearchResult:
    make: str = ""
    model: str = ""
    items: List[CarItem] = field(default_factory=list)


def search_cargurus(page: Page, request: CarGurusSearchRequest) -> CarGurusSearchResult:
    """Search CarGurus for used cars."""
    url = f"https://www.cargurus.com/Cars/inventorylisting/viewDetailsFilterViewInventoryListing.action?sourceContext=carGurusHomePageModel&entitySelectingHelper.selectedEntity=c27764&zip={request.zip_code}"
    print(f"Loading {url}...")
    checkpoint("Navigate to listings")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(6000)

    result = CarGurusSearchResult(make=request.make, model=request.model)

    checkpoint("Extract car listings")
    js_code = """(max) => {
        const items = [];
        const cards = document.querySelectorAll('[class*="listing"], [data-cg-ft*="listing"], [class*="result"], article');
        for (const card of cards) {
            if (items.length >= max) break;
            const text = (card.textContent || '').replace(/\\s+/g, ' ').trim();

            let title = '';
            const titleEl = card.querySelector('h4 a, h3 a, [class*="title"], [data-cg-ft*="title"]');
            if (titleEl) title = titleEl.textContent.trim();
            if (!title || title.length < 5) continue;
            if (items.some(i => i.trim === title)) continue;

            let year = '';
            const yearMatch = title.match(/(20[0-2]\\d|201\\d)/);
            if (yearMatch) year = yearMatch[1];

            let trim = title;

            let mileage = '';
            const miMatch = text.match(/([\\d,]+)\\s*(?:mi|miles)/i);
            if (miMatch) mileage = miMatch[1] + ' mi';

            let price = '';
            const priceMatch = text.match(/\\$[\\d,]+/);
            if (priceMatch) price = priceMatch[0];

            let deal = '';
            const dealMatch = text.match(/(great|good|fair|high|overpriced)\\s*(?:deal|price)/i);
            if (dealMatch) deal = dealMatch[1];

            let seller = '';
            const sellerEl = card.querySelector('[class*="dealer"], [class*="seller"]');
            if (sellerEl) seller = sellerEl.textContent.trim();

            items.push({year: year, trim: trim, mileage: mileage, price: price, deal_rating: deal, seller_name: seller});
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = CarItem()
        item.year = d.get("year", "")
        item.trim = d.get("trim", "")
        item.mileage = d.get("mileage", "")
        item.price = d.get("price", "")
        item.deal_rating = d.get("deal_rating", "")
        item.seller_name = d.get("seller_name", "")
        result.items.append(item)

    print(f"\nFound {len(result.items)} listings for '{request.make} {request.model}':")
    for i, item in enumerate(result.items, 1):
        print(f"\n  {i}. {item.year} {item.trim}")
        print(f"     Mileage: {item.mileage}  Price: {item.price}  Deal: {item.deal_rating}  Seller: {item.seller_name}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("cargurus")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            result = search_cargurus(page, CarGurusSearchRequest())
            print("\n=== DONE ===")
            print(f"Found {len(result.items)} listings")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
