const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * ShopGoodwill – Search for auction items
 */

const CFG = {
  searchQuery: "vintage watch",
  maxResults: 5,
  waits: { page: 5000, action: 2000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
ShopGoodwill – Search for auction items

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
class ShopgoodwillSearchRequest:
    search_query: str = "${cfg.searchQuery}"
    max_results: int = ${cfg.maxResults}


@dataclass
class ShopgoodwillAuctionItem:
    item_name: str = ""
    current_bid: str = ""
    num_bids: str = ""
    time_remaining: str = ""
    condition: str = ""


@dataclass
class ShopgoodwillSearchResult:
    items: List[ShopgoodwillAuctionItem] = field(default_factory=list)


# Search for auction items on ShopGoodwill.
def shopgoodwill_search(page: Page, request: ShopgoodwillSearchRequest) -> ShopgoodwillSearchResult:
    """Search for auction items on ShopGoodwill."""
    print(f"  Query: {request.search_query}\\n")

    query = request.search_query.replace(" ", "+")
    url = f"https://shopgoodwill.com/categories/listing?st={query}"
    print(f"Loading {url}...")
    checkpoint("Navigate to ShopGoodwill search results")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    result = ShopgoodwillSearchResult()

    checkpoint("Extract auction listings")
    js_code = """(max) => {
        const cards = document.querySelectorAll('[class*="product-card"], [class*="item-card"], [class*="listing-item"], [class*="search-result"] .row, [class*="product"] .card');
        const items = [];
        for (const card of cards) {
            if (items.length >= max) break;
            const nameEl = card.querySelector('[class*="item-name"], [class*="title"] a, h4 a, [class*="product-title"], a[class*="item"]');
            const bidEl = card.querySelector('[class*="current-bid"], [class*="price"], [class*="bid-amount"], [class*="item-price"]');
            const bidsEl = card.querySelector('[class*="num-bids"], [class*="bid-count"], [class*="number-of-bids"]');
            const timeEl = card.querySelector('[class*="time-remaining"], [class*="time-left"], [class*="countdown"], [class*="ending"]');
            const conditionEl = card.querySelector('[class*="condition"], [class*="item-condition"]');

            const item_name = nameEl ? nameEl.textContent.trim() : '';
            const current_bid = bidEl ? bidEl.textContent.trim() : '';
            const num_bids = bidsEl ? bidsEl.textContent.trim().replace(/[^\\d]/g, '') : '';
            const time_remaining = timeEl ? timeEl.textContent.trim() : '';
            const condition = conditionEl ? conditionEl.textContent.trim() : '';

            if (item_name) {
                items.push({item_name, current_bid, num_bids, time_remaining, condition});
            }
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = ShopgoodwillAuctionItem()
        item.item_name = d.get("item_name", "")
        item.current_bid = d.get("current_bid", "")
        item.num_bids = d.get("num_bids", "")
        item.time_remaining = d.get("time_remaining", "")
        item.condition = d.get("condition", "")
        result.items.append(item)

    for i, item in enumerate(result.items, 1):
        print(f"\\n  Item {i}:")
        print(f"    Name:      {item.item_name}")
        print(f"    Bid:       {item.current_bid}")
        print(f"    Bids:      {item.num_bids}")
        print(f"    Time Left: {item.time_remaining}")
        print(f"    Condition: {item.condition}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("shopgoodwill")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            request = ShopgoodwillSearchRequest()
            result = shopgoodwill_search(page, request)
            print("\\n=== DONE ===")
            print(f"Found {len(result.items)} items")
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
    const url = `https://shopgoodwill.com/categories/listing?st=${query}`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    recorder.record("navigate", url, `Navigate to ${url}`);
    await page.waitForTimeout(CFG.waits.page);

    const data = await stagehand.extract(
      `Extract the first ${CFG.maxResults} auction item results. For each get the item name, current bid, number of bids, time remaining, and condition.`
    );
    recorder.record("extract", "auction listings", JSON.stringify(data));
    console.log("Extracted:", JSON.stringify(data, null, 2));

    const outDir = __dirname;
    fs.writeFileSync(path.join(outDir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    fs.writeFileSync(path.join(outDir, "shopgoodwill_search.py"), genPython(CFG, recorder));
    console.log("Saved shopgoodwill_search.py");
  } finally {
    await stagehand.close();
  }
})();
