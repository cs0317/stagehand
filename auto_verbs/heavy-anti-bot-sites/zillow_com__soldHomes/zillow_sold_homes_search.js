const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Zillow – Browse recently sold homes by location
 */

const CFG = {
  location: "san-francisco-ca",
  maxResults: 5,
  waits: { page: 5000, action: 2000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Zillow – Browse recently sold homes by location

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
class ZillowSoldHomesSearchRequest:
    location: str = "${cfg.location}"
    max_results: int = ${cfg.maxResults}


@dataclass
class ZillowSoldHomesItem:
    address: str = ""
    sold_price: str = ""
    sold_date: str = ""
    beds: str = ""
    baths: str = ""
    sqft: str = ""
    price_per_sqft: str = ""
    listing_type: str = ""


@dataclass
class ZillowSoldHomesSearchResult:
    items: List[ZillowSoldHomesItem] = field(default_factory=list)


# Browse recently sold homes on Zillow by location.
def zillow_sold_homes_search(page: Page, request: ZillowSoldHomesSearchRequest) -> ZillowSoldHomesSearchResult:
    """Browse recently sold homes on Zillow by location."""
    print(f"  Location: {request.location}")
    print(f"  Max results: {request.max_results}\\n")

    url = f"https://www.zillow.com/{request.location}/sold/"
    print(f"Loading {url}...")
    checkpoint("Navigate to Zillow sold homes page")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    result = ZillowSoldHomesSearchResult()

    checkpoint("Extract sold home listings")
    js_code = """(max) => {
        const cards = document.querySelectorAll('[class*="ListItem"], [class*="property-card"], article[class*="card"], [data-test="property-card"], li[class*="ListItem"]');
        const items = [];
        for (const card of cards) {
            if (items.length >= max) break;
            const addrEl = card.querySelector('[data-test="property-card-addr"], address, [class*="address"], [class*="StyledPropertyCardDataArea"] a');
            const priceEl = card.querySelector('[data-test="property-card-price"], [class*="price"], span[class*="Price"]');
            const dateEl = card.querySelector('[class*="sold"], [class*="date"], [class*="Date"]');
            const bedsEl = card.querySelector('[class*="beds"], [class*="Beds"], abbr[class*="beds"]');
            const bathsEl = card.querySelector('[class*="baths"], [class*="Baths"], abbr[class*="baths"]');
            const sqftEl = card.querySelector('[class*="sqft"], [class*="area"], abbr[class*="sqft"]');
            const typeEl = card.querySelector('[class*="type"], [class*="Type"], [class*="badge"]');

            const address = addrEl ? addrEl.textContent.trim() : '';
            const sold_price = priceEl ? priceEl.textContent.trim() : '';
            const sold_date = dateEl ? dateEl.textContent.trim() : '';
            const beds = bedsEl ? bedsEl.textContent.trim() : '';
            const baths = bathsEl ? bathsEl.textContent.trim() : '';
            const sqft = sqftEl ? sqftEl.textContent.trim() : '';
            const listing_type = typeEl ? typeEl.textContent.trim() : '';

            if (address) {
                items.push({address, sold_price, sold_date, beds, baths, sqft, price_per_sqft: '', listing_type});
            }
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = ZillowSoldHomesItem()
        item.address = d.get("address", "")
        item.sold_price = d.get("sold_price", "")
        item.sold_date = d.get("sold_date", "")
        item.beds = d.get("beds", "")
        item.baths = d.get("baths", "")
        item.sqft = d.get("sqft", "")
        item.price_per_sqft = d.get("price_per_sqft", "")
        item.listing_type = d.get("listing_type", "")
        result.items.append(item)

    for i, item in enumerate(result.items, 1):
        print(f"\\n  Home {i}:")
        print(f"    Address:       {item.address}")
        print(f"    Sold Price:    {item.sold_price}")
        print(f"    Sold Date:     {item.sold_date}")
        print(f"    Beds:          {item.beds}")
        print(f"    Baths:         {item.baths}")
        print(f"    Sqft:          {item.sqft}")
        print(f"    Price/Sqft:    {item.price_per_sqft}")
        print(f"    Listing Type:  {item.listing_type}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("zillow_sold")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            request = ZillowSoldHomesSearchRequest()
            result = zillow_sold_homes_search(page, request)
            print("\\n=== DONE ===")
            print(f"Found {len(result.items)} sold homes")
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
    const url = `https://www.zillow.com/${CFG.location}/sold/`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    recorder.record("navigate", url, `Navigate to ${url}`);
    await page.waitForTimeout(CFG.waits.page);

    const data = await stagehand.extract(
      `Extract the first ${CFG.maxResults} recently sold home listings. For each get the address, sold price, sold date, beds, baths, sqft, price per sqft, and listing type.`
    );
    recorder.record("extract", "sold homes", JSON.stringify(data));
    console.log("Extracted:", JSON.stringify(data, null, 2));

    const outDir = __dirname;
    fs.writeFileSync(path.join(outDir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    fs.writeFileSync(path.join(outDir, "zillow_sold_homes_search.py"), genPython(CFG, recorder));
    console.log("Saved zillow_sold_homes_search.py");
  } finally {
    await stagehand.close();
  }
})();
