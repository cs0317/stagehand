const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Etsy – Search for vintage items
 */

const CFG = {
  searchQuery: "vintage jewelry",
  maxResults: 5,
  waits: { page: 5000, action: 2000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Etsy – Search for vintage items

Generated on: ${ts}
Recorded ${n} browser interactions
"""

import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class EtsyVintageSearchRequest:
    search_query: str = "${cfg.searchQuery}"
    max_results: int = ${cfg.maxResults}


@dataclass
class EtsyVintageItem:
    item_name: str = ""
    shop_name: str = ""
    price: str = ""
    original_price: str = ""
    rating: str = ""
    num_reviews: str = ""
    is_free_shipping: str = ""


@dataclass
class EtsyVintageSearchResult:
    items: List[EtsyVintageItem] = field(default_factory=list)


# Search for vintage items on Etsy.
def etsy_vintage_search(page: Page, request: EtsyVintageSearchRequest) -> EtsyVintageSearchResult:
    """Search for vintage items on Etsy."""
    print(f"  Query: {request.search_query}\\n")

    query = request.search_query.replace(" ", "+")
    url = f"https://www.etsy.com/search?q={query}&explicit=1&is_vintage=true"
    print(f"Loading {url}...")
    checkpoint("Navigate to Etsy vintage search results")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    result = EtsyVintageSearchResult()

    checkpoint("Extract vintage item listings")
    js_code = """(max) => {
        const cards = document.querySelectorAll('[data-search-results] li, .v2-listing-card, [class*="ListingCard"], [class*="listing-card"], [data-listing-id]');
        const items = [];
        for (const card of cards) {
            if (items.length >= max) break;
            const nameEl = card.querySelector('h3, h2, [class*="title"], [class*="Title"], a[title]');
            const shopEl = card.querySelector('[class*="shop"], [class*="Shop"], [class*="seller"], p[class*="shop"]');
            const priceEl = card.querySelector('[class*="price"] span[class*="currency"], [class*="Price"], .currency-value');
            const origPriceEl = card.querySelector('[class*="original"], [class*="Original"], [class*="was-price"], s, del');
            const ratingEl = card.querySelector('[class*="rating"], [class*="Rating"], [aria-label*="star"]');
            const reviewsEl = card.querySelector('[class*="review"], [class*="Review"], [class*="count"]');
            const shippingEl = card.querySelector('[class*="free-shipping"], [class*="FreeShipping"], [class*="shipping"]');

            const item_name = nameEl ? (nameEl.getAttribute('title') || nameEl.textContent.trim()) : '';
            const shop_name = shopEl ? shopEl.textContent.trim() : '';
            const price = priceEl ? priceEl.textContent.trim() : '';
            const original_price = origPriceEl ? origPriceEl.textContent.trim() : '';
            const rating = ratingEl ? (ratingEl.getAttribute('aria-label') || ratingEl.textContent.trim()) : '';
            const num_reviews = reviewsEl ? reviewsEl.textContent.trim().replace(/[^\\d,]/g, '') : '';
            const is_free_shipping = shippingEl ? (shippingEl.textContent.toLowerCase().includes('free') ? 'Yes' : 'No') : 'No';

            if (item_name) {
                items.push({item_name, shop_name, price, original_price, rating, num_reviews, is_free_shipping});
            }
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = EtsyVintageItem()
        item.item_name = d.get("item_name", "")
        item.shop_name = d.get("shop_name", "")
        item.price = d.get("price", "")
        item.original_price = d.get("original_price", "")
        item.rating = d.get("rating", "")
        item.num_reviews = d.get("num_reviews", "")
        item.is_free_shipping = d.get("is_free_shipping", "")
        result.items.append(item)

    for i, item in enumerate(result.items, 1):
        print(f"\\n  Item {i}:")
        print(f"    Name:          {item.item_name}")
        print(f"    Shop:          {item.shop_name}")
        print(f"    Price:         {item.price}")
        print(f"    Original:      {item.original_price}")
        print(f"    Rating:        {item.rating}")
        print(f"    Reviews:       {item.num_reviews}")
        print(f"    Free Shipping: {item.is_free_shipping}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("etsy_vintage")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            request = EtsyVintageSearchRequest()
            result = etsy_vintage_search(page, request)
            print("\\n=== DONE ===")
            print(f"Found {len(result.items)} vintage items")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
`;
}

(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder(stagehand.page);
  const page = stagehand.page;

  try {
    const query = CFG.searchQuery.replace(/ /g, "+");
    const url = `https://www.etsy.com/search?q=${query}&explicit=1&is_vintage=true`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    recorder.record("navigate", url, `Navigate to ${url}`);
    await page.waitForTimeout(CFG.waits.page);

    const data = await stagehand.extract(
      `Extract the first ${CFG.maxResults} vintage item listings. For each get the item name, shop name, price, original price, rating, number of reviews, and whether it has free shipping.`
    );
    recorder.record("extract", "vintage item listings", JSON.stringify(data));
    console.log("Extracted:", JSON.stringify(data, null, 2));

    const outDir = __dirname;
    fs.writeFileSync(path.join(outDir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    fs.writeFileSync(path.join(outDir, "etsy_vintage_search.py"), genPython(CFG, recorder));
    console.log("Saved etsy_vintage_search.py");
  } finally {
    await stagehand.close();
  }
})();
