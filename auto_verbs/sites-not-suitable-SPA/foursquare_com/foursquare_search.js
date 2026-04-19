const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Foursquare – Search for places and venues by location and keyword
 */

const CFG = {
  location: "New York",
  searchQuery: "coffee",
  maxResults: 5,
  waits: { page: 5000, action: 2000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Foursquare – Search for places and venues by location and keyword

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
class FoursquareSearchRequest:
    location: str = "${cfg.location}"
    search_query: str = "${cfg.searchQuery}"
    max_results: int = ${cfg.maxResults}


@dataclass
class FoursquareVenueItem:
    venue_name: str = ""
    category: str = ""
    address: str = ""
    rating: str = ""
    price_tier: str = ""
    num_tips: str = ""


@dataclass
class FoursquareSearchResult:
    items: List[FoursquareVenueItem] = field(default_factory=list)


# Search for places and venues on Foursquare by location and keyword.
def foursquare_search(page: Page, request: FoursquareSearchRequest) -> FoursquareSearchResult:
    """Search for places and venues on Foursquare."""
    print(f"  Location: {request.location}, Query: {request.search_query}\\n")

    location = request.location.replace(" ", "+")
    query = request.search_query.replace(" ", "+")
    url = f"https://foursquare.com/explore?near={location}&q={query}"
    print(f"Loading {url}...")
    checkpoint("Navigate to Foursquare explore results")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    result = FoursquareSearchResult()

    checkpoint("Extract venue listings")
    js_code = """(max) => {
        const cards = document.querySelectorAll('[class*="venue"], [class*="result"], [class*="card"], [class*="item"], li[class*="list"]');
        const items = [];
        for (const card of cards) {
            if (items.length >= max) break;
            const nameEl = card.querySelector('h2, h3, [class*="name"], [class*="title"], a[class*="venue"]');
            const categoryEl = card.querySelector('[class*="category"], [class*="type"], span[class*="cat"]');
            const addressEl = card.querySelector('[class*="address"], [class*="location"], [class*="addr"]');
            const ratingEl = card.querySelector('[class*="rating"], [class*="score"]');
            const priceEl = card.querySelector('[class*="price"], [class*="tier"]');
            const tipsEl = card.querySelector('[class*="tips"], [class*="count"], [class*="review"]');

            const venue_name = nameEl ? nameEl.textContent.trim() : '';
            const category = categoryEl ? categoryEl.textContent.trim() : '';
            const address = addressEl ? addressEl.textContent.trim() : '';
            const rating = ratingEl ? ratingEl.textContent.trim() : '';
            const price_tier = priceEl ? priceEl.textContent.trim() : '';
            const num_tips = tipsEl ? tipsEl.textContent.trim() : '';

            if (venue_name) {
                items.push({venue_name, category, address, rating, price_tier, num_tips});
            }
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = FoursquareVenueItem()
        item.venue_name = d.get("venue_name", "")
        item.category = d.get("category", "")
        item.address = d.get("address", "")
        item.rating = d.get("rating", "")
        item.price_tier = d.get("price_tier", "")
        item.num_tips = d.get("num_tips", "")
        result.items.append(item)

    for i, item in enumerate(result.items, 1):
        print(f"\\n  Venue {i}:")
        print(f"    Name:       {item.venue_name}")
        print(f"    Category:   {item.category}")
        print(f"    Address:    {item.address}")
        print(f"    Rating:     {item.rating}")
        print(f"    Price Tier: {item.price_tier}")
        print(f"    Tips:       {item.num_tips}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("foursquare")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            request = FoursquareSearchRequest()
            result = foursquare_search(page, request)
            print("\\n=== DONE ===")
            print(f"Found {len(result.items)} venues")
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
    const location = CFG.location.replace(/ /g, "+");
    const query = CFG.searchQuery.replace(/ /g, "+");
    const url = `https://foursquare.com/explore?near=${location}&q=${query}`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    recorder.record("navigate", url, `Navigate to ${url}`);
    await page.waitForTimeout(CFG.waits.page);

    const data = await stagehand.extract(
      `Extract the first ${CFG.maxResults} venue results. For each get the venue name, category, address, rating, price tier, and number of tips.`
    );
    recorder.record("extract", "venue data", JSON.stringify(data));
    console.log("Extracted:", JSON.stringify(data, null, 2));

    const outDir = __dirname;
    fs.writeFileSync(path.join(outDir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    fs.writeFileSync(path.join(outDir, "foursquare_search.py"), genPython(CFG, recorder));
    console.log("Saved foursquare_search.py");
  } finally {
    await stagehand.close();
  }
})();
