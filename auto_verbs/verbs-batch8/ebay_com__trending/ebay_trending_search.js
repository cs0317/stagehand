const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * eBay – Browse trending products
 */

const CFG = {
  maxResults: 10,
  waits: { page: 5000, action: 2000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
eBay – Browse trending products

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
class EbayTrendingSearchRequest:
    max_results: int = ${cfg.maxResults}


@dataclass
class EbayTrendingItem:
    product_name: str = ""
    price: str = ""
    num_sold: str = ""
    trending_rank: str = ""
    category: str = ""


@dataclass
class EbayTrendingSearchResult:
    items: List[EbayTrendingItem] = field(default_factory=list)


# Browse trending products on eBay.
def ebay_trending_search(page: Page, request: EbayTrendingSearchRequest) -> EbayTrendingSearchResult:
    """Browse trending products on eBay."""
    print(f"  Max results: {request.max_results}\\n")

    url = "https://www.ebay.com/trending"
    print(f"Loading {url}...")
    checkpoint("Navigate to eBay trending page")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    result = EbayTrendingSearchResult()

    checkpoint("Extract trending product listings")
    js_code = """(max) => {
        const cards = document.querySelectorAll('[class*="trending"], [class*="item"], .s-item, [class*="card"], [class*="product"], li[class*="Item"]');
        const items = [];
        let rank = 0;
        for (const card of cards) {
            if (items.length >= max) break;
            const nameEl = card.querySelector('h3, h2, [class*="title"], [class*="name"], a[class*="title"]');
            const priceEl = card.querySelector('[class*="price"], .s-item__price, span[class*="Price"]');
            const soldEl = card.querySelector('[class*="sold"], [class*="quantity"], [class*="hotness"], [class*="count"]');
            const categoryEl = card.querySelector('[class*="category"], [class*="subtitle"], [class*="type"]');

            const product_name = nameEl ? nameEl.textContent.trim() : '';
            const price = priceEl ? priceEl.textContent.trim() : '';
            const num_sold = soldEl ? soldEl.textContent.trim() : '';
            const category = categoryEl ? categoryEl.textContent.trim() : '';

            if (product_name) {
                rank++;
                items.push({product_name, price, num_sold, trending_rank: String(rank), category});
            }
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = EbayTrendingItem()
        item.product_name = d.get("product_name", "")
        item.price = d.get("price", "")
        item.num_sold = d.get("num_sold", "")
        item.trending_rank = d.get("trending_rank", "")
        item.category = d.get("category", "")
        result.items.append(item)

    for i, item in enumerate(result.items, 1):
        print(f"\\n  Product {i}:")
        print(f"    Name:     {item.product_name}")
        print(f"    Price:    {item.price}")
        print(f"    Sold:     {item.num_sold}")
        print(f"    Rank:     {item.trending_rank}")
        print(f"    Category: {item.category}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("ebay_trending")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            request = EbayTrendingSearchRequest()
            result = ebay_trending_search(page, request)
            print("\\n=== DONE ===")
            print(f"Found {len(result.items)} trending products")
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
    const url = "https://www.ebay.com/trending";
    await page.goto(url, { waitUntil: "domcontentloaded" });
    recorder.record("navigate", url, `Navigate to ${url}`);
    await page.waitForTimeout(CFG.waits.page);

    const data = await stagehand.extract(
      `Extract the first ${CFG.maxResults} trending products. For each get the product name, price, number sold, trending rank, and category.`
    );
    recorder.record("extract", "trending products", JSON.stringify(data));
    console.log("Extracted:", JSON.stringify(data, null, 2));

    const outDir = __dirname;
    fs.writeFileSync(path.join(outDir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    fs.writeFileSync(path.join(outDir, "ebay_trending_search.py"), genPython(CFG, recorder));
    console.log("Saved ebay_trending_search.py");
  } finally {
    await stagehand.close();
  }
})();
