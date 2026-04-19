const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Priceline – Search for hotel deals by destination
 */

const CFG = {
  destination: "new-york",
  maxResults: 5,
  waits: { page: 7000, action: 2000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Priceline – Search for hotel deals by destination

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
class PricelineSearchRequest:
    destination: str = "${cfg.destination}"
    max_results: int = ${cfg.maxResults}


@dataclass
class PricelineHotelItem:
    hotel_name: str = ""
    star_rating: str = ""
    guest_rating: str = ""
    price_per_night: str = ""
    neighborhood: str = ""
    amenities: str = ""


@dataclass
class PricelineSearchResult:
    items: List[PricelineHotelItem] = field(default_factory=list)


# Search for hotel deals on Priceline by destination.
def priceline_search(page: Page, request: PricelineSearchRequest) -> PricelineSearchResult:
    """Search for hotel deals on Priceline."""
    print(f"  Destination: {request.destination}\\n")

    url = f"https://www.priceline.com/relax/in/{request.destination}"
    print(f"Loading {url}...")
    checkpoint("Navigate to Priceline hotel results")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(7000)

    result = PricelineSearchResult()

    checkpoint("Extract hotel listings")
    js_code = """(max) => {
        const cards = document.querySelectorAll('[class*="HotelCard"], [class*="hotel-card"], [class*="listing"], [data-testid*="hotel"], [class*="PropertyCard"]');
        const items = [];
        for (const card of cards) {
            if (items.length >= max) break;
            const nameEl = card.querySelector('h2, h3, [class*="name"], [class*="title"], [class*="hotel-name"]');
            const starEl = card.querySelector('[class*="star"], [class*="Star"], [aria-label*="star"]');
            const ratingEl = card.querySelector('[class*="rating"], [class*="score"], [class*="guest-rating"]');
            const priceEl = card.querySelector('[class*="price"], [class*="Price"], [class*="cost"], [data-testid*="price"]');
            const neighborhoodEl = card.querySelector('[class*="neighborhood"], [class*="location"], [class*="address"], [class*="area"]');
            const amenitiesEl = card.querySelector('[class*="amenit"], [class*="feature"], [class*="perk"]');

            const hotel_name = nameEl ? nameEl.textContent.trim() : '';
            const star_rating = starEl ? (starEl.getAttribute('aria-label') || starEl.textContent.trim()) : '';
            const guest_rating = ratingEl ? ratingEl.textContent.trim() : '';
            const price_per_night = priceEl ? priceEl.textContent.trim() : '';
            const neighborhood = neighborhoodEl ? neighborhoodEl.textContent.trim() : '';
            const amenities = amenitiesEl ? amenitiesEl.textContent.trim() : '';

            if (hotel_name) {
                items.push({hotel_name, star_rating, guest_rating, price_per_night, neighborhood, amenities});
            }
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = PricelineHotelItem()
        item.hotel_name = d.get("hotel_name", "")
        item.star_rating = d.get("star_rating", "")
        item.guest_rating = d.get("guest_rating", "")
        item.price_per_night = d.get("price_per_night", "")
        item.neighborhood = d.get("neighborhood", "")
        item.amenities = d.get("amenities", "")
        result.items.append(item)

    for i, item in enumerate(result.items, 1):
        print(f"\\n  Hotel {i}:")
        print(f"    Name:         {item.hotel_name}")
        print(f"    Stars:        {item.star_rating}")
        print(f"    Guest Rating: {item.guest_rating}")
        print(f"    Price/Night:  {item.price_per_night}")
        print(f"    Neighborhood: {item.neighborhood}")
        print(f"    Amenities:    {item.amenities[:80]}...")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("priceline")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            request = PricelineSearchRequest()
            result = priceline_search(page, request)
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
    const url = `https://www.priceline.com/relax/in/${CFG.destination}`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    recorder.record("navigate", url, `Navigate to ${url}`);
    await page.waitForTimeout(CFG.waits.page);

    const data = await stagehand.extract(
      `Extract the first ${CFG.maxResults} hotel results. For each get the hotel name, star rating, guest rating, price per night, neighborhood, and amenities.`
    );
    recorder.record("extract", "hotel listings", JSON.stringify(data));
    console.log("Extracted:", JSON.stringify(data, null, 2));

    const outDir = __dirname;
    fs.writeFileSync(path.join(outDir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    fs.writeFileSync(path.join(outDir, "priceline_search.py"), genPython(CFG, recorder));
    console.log("Saved priceline_search.py");
  } finally {
    await stagehand.close();
  }
})();
