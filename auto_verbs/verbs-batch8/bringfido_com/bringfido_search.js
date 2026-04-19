const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * BringFido – Search for pet-friendly hotels by destination
 */

const CFG = {
  city: "san-francisco-ca",
  maxResults: 5,
  waits: { page: 5000, action: 2000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
BringFido – Search for pet-friendly hotels by destination

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
class BringFidoSearchRequest:
    city: str = "${cfg.city}"
    max_results: int = ${cfg.maxResults}


@dataclass
class BringFidoHotelItem:
    hotel_name: str = ""
    address: str = ""
    rating: str = ""
    price_range: str = ""
    pet_policy: str = ""
    amenities: str = ""


@dataclass
class BringFidoSearchResult:
    items: List[BringFidoHotelItem] = field(default_factory=list)


# Search for pet-friendly hotels on BringFido by destination.
def bringfido_search(page: Page, request: BringFidoSearchRequest) -> BringFidoSearchResult:
    """Search for pet-friendly hotels on BringFido."""
    print(f"  City: {request.city}")
    print(f"  Max results: {request.max_results}\\n")

    url = f"https://www.bringfido.com/lodging/city/{request.city}/"
    print(f"Loading {url}...")
    checkpoint("Navigate to BringFido lodging page")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    result = BringFidoSearchResult()

    checkpoint("Extract pet-friendly hotel listings")
    js_code = """(max) => {
        const cards = document.querySelectorAll('[class*="property"], [class*="hotel"], [class*="listing"], article, .card');
        const items = [];
        for (const card of cards) {
            if (items.length >= max) break;

            const nameEl = card.querySelector('h2, h3, h4, [class*="name"], [class*="title"] a, a[class*="name"]');
            const name = nameEl ? nameEl.textContent.trim() : '';
            if (!name) continue;

            const addrEl = card.querySelector('[class*="address"], [class*="location"], address, [class*="city"]');
            const address = addrEl ? addrEl.textContent.trim() : '';

            const ratingEl = card.querySelector('[class*="rating"], [class*="score"], [class*="star"]');
            const rating = ratingEl ? ratingEl.textContent.trim() : '';

            const priceEl = card.querySelector('[class*="price"], [class*="rate"]');
            const priceRange = priceEl ? priceEl.textContent.trim() : '';

            const petEl = card.querySelector('[class*="pet"], [class*="policy"]');
            const petPolicy = petEl ? petEl.textContent.trim() : '';

            const amenEl = card.querySelector('[class*="amenit"], [class*="feature"]');
            const amenities = amenEl ? amenEl.textContent.trim() : '';

            items.push({
                hotel_name: name,
                address: address,
                rating: rating,
                price_range: priceRange,
                pet_policy: petPolicy,
                amenities: amenities
            });
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = BringFidoHotelItem()
        item.hotel_name = d.get("hotel_name", "")
        item.address = d.get("address", "")
        item.rating = d.get("rating", "")
        item.price_range = d.get("price_range", "")
        item.pet_policy = d.get("pet_policy", "")
        item.amenities = d.get("amenities", "")
        result.items.append(item)

    for i, item in enumerate(result.items, 1):
        print(f"\\n  Hotel {i}:")
        print(f"    Name:       {item.hotel_name}")
        print(f"    Address:    {item.address}")
        print(f"    Rating:     {item.rating}")
        print(f"    Price:      {item.price_range}")
        print(f"    Pet Policy: {item.pet_policy}")
        print(f"    Amenities:  {item.amenities}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("bringfido")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            request = BringFidoSearchRequest()
            result = bringfido_search(page, request)
            print("\\n=== DONE ===")
            print(f"Found {len(result.items)} hotels")
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
    const url = `https://www.bringfido.com/lodging/city/${CFG.city}/`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    recorder.record("navigate", url, `Navigate to ${url}`);
    await page.waitForTimeout(CFG.waits.page);

    const data = await stagehand.extract(
      `Extract the top ${CFG.maxResults} pet-friendly hotel listings. For each get the hotel name, address, rating, price range, pet policy, and amenities.`
    );
    recorder.record("extract", "hotel listings", JSON.stringify(data));
    console.log("Extracted:", JSON.stringify(data, null, 2));

    const outDir = __dirname;
    fs.writeFileSync(path.join(outDir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    fs.writeFileSync(path.join(outDir, "bringfido_search.py"), genPython(CFG, recorder));
    console.log("Saved bringfido_search.py");
  } finally {
    await stagehand.close();
  }
})();
