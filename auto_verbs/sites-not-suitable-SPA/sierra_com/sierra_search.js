const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Sierra – Search for outdoor and active products
 */

const CFG = {
  searchQuery: "hiking jacket",
  maxResults: 5,
  waits: { page: 5000, action: 2000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Sierra – Search for outdoor and active products

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
class SierraSearchRequest:
    search_query: str = "${cfg.searchQuery}"
    max_results: int = ${cfg.maxResults}


@dataclass
class SierraProductItem:
    product_name: str = ""
    brand: str = ""
    price: str = ""
    original_price: str = ""
    discount_percentage: str = ""


@dataclass
class SierraSearchResult:
    items: List[SierraProductItem] = field(default_factory=list)


# Search for outdoor and active products on Sierra.
def sierra_search(page: Page, request: SierraSearchRequest) -> SierraSearchResult:
    """Search for outdoor and active products on Sierra."""
    print(f"  Query: {request.search_query}\\n")

    query = request.search_query.replace(" ", "~")
    url = f"https://www.sierra.com/s~{query}/"
    print(f"Loading {url}...")
    checkpoint("Navigate to Sierra search results")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    result = SierraSearchResult()

    checkpoint("Extract product listings")
    js_code = """(max) => {
        const cards = document.querySelectorAll('[class*="product-card"], [class*="SearchResult"] li, [class*="product-list"] article, [class*="search-result"] .product, [data-testid*="product"]');
        const items = [];
        for (const card of cards) {
            if (items.length >= max) break;
            const nameEl = card.querySelector('[class*="product-name"], [class*="title"] a, h3 a, [class*="ProductName"]');
            const brandEl = card.querySelector('[class*="brand"], [class*="Brand"], [class*="designer"]');
            const priceEl = card.querySelector('[class*="sale-price"], [class*="our-price"], [class*="Price"]:not([class*="compare"]):not([class*="original"])');
            const origPriceEl = card.querySelector('[class*="compare-price"], [class*="original-price"], [class*="ComparePrice"], s, del');
            const discountEl = card.querySelector('[class*="discount"], [class*="savings"], [class*="percent-off"], [class*="save"]');

            const product_name = nameEl ? nameEl.textContent.trim() : '';
            const brand = brandEl ? brandEl.textContent.trim() : '';
            const price = priceEl ? priceEl.textContent.trim() : '';
            const original_price = origPriceEl ? origPriceEl.textContent.trim() : '';
            const discount_percentage = discountEl ? discountEl.textContent.trim() : '';

            if (product_name) {
                items.push({product_name, brand, price, original_price, discount_percentage});
            }
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = SierraProductItem()
        item.product_name = d.get("product_name", "")
        item.brand = d.get("brand", "")
        item.price = d.get("price", "")
        item.original_price = d.get("original_price", "")
        item.discount_percentage = d.get("discount_percentage", "")
        result.items.append(item)

    for i, item in enumerate(result.items, 1):
        print(f"\\n  Product {i}:")
        print(f"    Name:     {item.product_name}")
        print(f"    Brand:    {item.brand}")
        print(f"    Price:    {item.price}")
        print(f"    Original: {item.original_price}")
        print(f"    Discount: {item.discount_percentage}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("sierra")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            request = SierraSearchRequest()
            result = sierra_search(page, request)
            print("\\n=== DONE ===")
            print(f"Found {len(result.items)} products")
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
    const query = CFG.searchQuery.replace(/ /g, "~");
    const url = `https://www.sierra.com/s~${query}/`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    recorder.record("navigate", url, `Navigate to ${url}`);
    await page.waitForTimeout(CFG.waits.page);

    const data = await stagehand.extract(
      `Extract the first ${CFG.maxResults} product results. For each get the product name, brand, price, original price, and discount percentage.`
    );
    recorder.record("extract", "product listings", JSON.stringify(data));
    console.log("Extracted:", JSON.stringify(data, null, 2));

    const outDir = __dirname;
    fs.writeFileSync(path.join(outDir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    fs.writeFileSync(path.join(outDir, "sierra_search.py"), genPython(CFG, recorder));
    console.log("Saved sierra_search.py");
  } finally {
    await stagehand.close();
  }
})();
