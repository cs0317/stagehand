const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Agoda – Hotel search by destination
 */

const CFG = {
  destination: "Bangkok, Thailand",
  nights: 3,
  maxResults: 5,
  waits: { page: 5000, action: 2000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Agoda – Hotel search

Generated on: ${ts}
Recorded ${n} browser interactions
"""

import os, sys, shutil, re
from dataclasses import dataclass, field
from typing import List
from datetime import date, timedelta
from dateutil.relativedelta import relativedelta
from urllib.parse import quote_plus
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class AgodaSearchRequest:
    destination: str = "${cfg.destination}"
    checkin_date: date = None
    checkout_date: date = None
    max_results: int = ${cfg.maxResults}


@dataclass
class HotelItem:
    hotel_name: str = ""
    star_rating: str = ""
    guest_score: str = ""
    price_per_night: str = ""
    distance_from_center: str = ""


@dataclass
class AgodaSearchResult:
    destination: str = ""
    items: List[HotelItem] = field(default_factory=list)


# Searches Agoda for hotels in a destination and extracts hotel details.
def search_agoda_hotels(page: Page, request: AgodaSearchRequest) -> AgodaSearchResult:
    """Search Agoda for hotel listings."""
    checkin = request.checkin_date or (date.today() + relativedelta(months=2))
    checkout = request.checkout_date or (checkin + timedelta(days=${cfg.nights}))
    ci = checkin.strftime("%Y-%m-%d")
    co = checkout.strftime("%Y-%m-%d")
    print(f"  Destination: {request.destination}")
    print(f"  Check-in: {ci}  Check-out: {co}\\n")

    encoded = quote_plus(request.destination)
    url = f"https://www.agoda.com/search?city=&checkIn={ci}&los=${cfg.nights}&rooms=1&adults=2&children=0&q={encoded}&isTextEncoder=true"
    print(f"Loading {url}...")
    checkpoint("Navigate to Agoda search")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(8000)

    # Dismiss popups
    for sel in ['button:has-text("OK")', 'button:has-text("Accept")', '[data-element-name="close-button"]', '[aria-label="Close"]']:
        try:
            btn = page.locator(sel).first
            if btn.is_visible(timeout=2000):
                btn.evaluate("el => el.click()")
                page.wait_for_timeout(500)
        except Exception:
            pass

    # Scroll to load
    for _ in range(3):
        page.evaluate("window.scrollBy(0, 600)")
        page.wait_for_timeout(800)
    page.evaluate("window.scrollTo(0, 0)")
    page.wait_for_timeout(500)

    result = AgodaSearchResult(destination=request.destination)

    checkpoint("Extract hotel listings")
    js_code = """(max) => {
        const items = [];
        const cards = document.querySelectorAll('[data-selenium="hotel-item"], [data-element-name="property-card"], [class*="PropertyCard"], [class*="hotel-list-item"], li[data-hotelid]');
        for (const card of cards) {
            if (items.length >= max) break;
            const text = (card.textContent || '').replace(/\\s+/g, ' ').trim();

            let name = '';
            const nameEl = card.querySelector('[data-selenium="hotel-name"], h3, [class*="PropertyName"], [class*="hotel-name"]');
            if (nameEl) name = nameEl.textContent.trim();

            let stars = '';
            const starEls = card.querySelectorAll('[class*="star"], [data-selenium="star"]');
            if (starEls.length > 0) stars = String(starEls.length);
            if (!stars) {
                const sm = text.match(/(\\d)[-\\s]*star/i);
                if (sm) stars = sm[1];
            }

            let score = '';
            const scoreEl = card.querySelector('[data-selenium="review-score"], [class*="ReviewScore"], [class*="review-score"]');
            if (scoreEl) score = scoreEl.textContent.trim();
            if (!score) {
                const scm = text.match(/(\\d+\\.?\\d*)\\s*\\/\\s*10/);
                if (scm) score = scm[1] + '/10';
            }

            let price = '';
            const priceEl = card.querySelector('[data-selenium="display-price"], [class*="Price"], [class*="price"]');
            if (priceEl) price = priceEl.textContent.trim();
            if (!price) {
                const pm = text.match(/(\\$|US\\$|THB|฿)[\\d,.]+/);
                if (pm) price = pm[0];
            }

            let distance = '';
            const distMatch = text.match(/(\\d+\\.?\\d*\\s*(?:km|mi|m)\\s*(?:from|to)?\\s*(?:city\\s*center|center|downtown)?)/i);
            if (distMatch) distance = distMatch[1];

            if (name) {
                items.push({hotel_name: name, star_rating: stars, guest_score: score, price_per_night: price, distance_from_center: distance});
            }
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = HotelItem()
        item.hotel_name = d.get("hotel_name", "")
        item.star_rating = d.get("star_rating", "")
        item.guest_score = d.get("guest_score", "")
        item.price_per_night = d.get("price_per_night", "")
        item.distance_from_center = d.get("distance_from_center", "")
        result.items.append(item)

    print(f"\\nFound {len(result.items)} hotels in '{request.destination}':")
    for i, item in enumerate(result.items, 1):
        print(f"\\n  {i}. {item.hotel_name}")
        print(f"     Stars:    {item.star_rating}")
        print(f"     Score:    {item.guest_score}")
        print(f"     Price:    {item.price_per_night}/night")
        print(f"     Distance: {item.distance_from_center}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("agoda")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            request = AgodaSearchRequest()
            result = search_agoda_hotels(page, request)
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
  const recorder = new PlaywrightRecorder();
  const page = stagehand.page;

  try {
    const encoded = encodeURIComponent(CFG.destination);
    const today = new Date();
    const ci = new Date(today.getFullYear(), today.getMonth() + 2, today.getDate());
    const ciStr = ci.toISOString().split("T")[0];
    const url = `https://www.agoda.com/search?city=&checkIn=${ciStr}&los=${CFG.nights}&rooms=1&adults=2&children=0&q=${encoded}&isTextEncoder=true`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    recorder.goto(url);
    await page.waitForTimeout(CFG.waits.page);

    const data = await stagehand.extract(
      `Extract the first ${CFG.maxResults} hotel listings. For each get the hotel name, star rating, guest score, price per night, and distance from city center.`
    );
    recorder.record("extract", { description: "hotel listings", results: data });
    console.log("Extracted:", JSON.stringify(data, null, 2));

    const outDir = __dirname;
    fs.writeFileSync(path.join(outDir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    fs.writeFileSync(path.join(outDir, "agoda_search.py"), genPython(CFG, recorder));
    console.log("Saved agoda_search.py");
  } finally {
    await stagehand.close();
  }
})();
