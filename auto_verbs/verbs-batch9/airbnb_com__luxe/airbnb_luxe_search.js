const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  location: "Malibu, California",
  maxResults: 5,
  waits: { page: 5000, action: 2000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  return `"""
Auto-generated Playwright script (Python)
Airbnb Luxe – Luxury stays search
Generated on: ${ts}
"""

import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from urllib.parse import quote_plus
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class AirbnbLuxeSearchRequest:
    location: str = "${cfg.location}"
    max_results: int = ${cfg.maxResults}


@dataclass
class LuxePropertyItem:
    property_name: str = ""
    price_per_night: str = ""
    bedrooms: str = ""
    bathrooms: str = ""
    guest_capacity: str = ""
    rating: str = ""


@dataclass
class AirbnbLuxeSearchResult:
    location: str = ""
    items: List[LuxePropertyItem] = field(default_factory=list)


def search_airbnb_luxe(page: Page, request: AirbnbLuxeSearchRequest) -> AirbnbLuxeSearchResult:
    encoded = quote_plus(request.location)
    url = f"https://www.airbnb.com/s/{encoded}/homes?refinement_paths%5B%5D=%2Fluxe"
    print(f"Loading {url}...")
    checkpoint("Navigate to Airbnb Luxe")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(6000)

    result = AirbnbLuxeSearchResult(location=request.location)

    checkpoint("Extract luxury listings")
    js_code = """(max) => {
        const items = [];
        const cards = document.querySelectorAll('[itemprop="itemListElement"], [data-testid="card-container"], [class*="listing"], [id^="listing_"]');
        for (const card of cards) {
            if (items.length >= max) break;
            const text = (card.textContent || '').replace(/\\\\s+/g, ' ').trim();

            let name = '';
            const nameEl = card.querySelector('[data-testid="listing-card-title"], [id*="title"], span[class*="title"]');
            if (nameEl) name = nameEl.textContent.trim();
            if (!name) {
                const h = card.querySelector('h3, h2');
                if (h) name = h.textContent.trim();
            }

            let price = '';
            const pm = text.match(/(\\\\$[\\\\d,]+)\\\\s*(?:night|per)/i);
            if (pm) price = pm[1] + '/night';

            let bedrooms = '';
            const brm = text.match(/(\\\\d+)\\\\s*bed(?:room)?s?/i);
            if (brm) bedrooms = brm[1];

            let bathrooms = '';
            const btm = text.match(/(\\\\d+\\\\.?\\\\d*)\\\\s*bath(?:room)?s?/i);
            if (btm) bathrooms = btm[1];

            let guests = '';
            const gm = text.match(/(\\\\d+)\\\\s*guest/i);
            if (gm) guests = gm[1];

            let rating = '';
            const rm = text.match(/(\\\\d\\\\.\\\\d+)\\\\s*(?:\\\\(|star|rating)/i);
            if (rm) rating = rm[1];
            if (!rating) {
                const rm2 = text.match(/★\\\\s*(\\\\d\\\\.\\\\d+)/);
                if (rm2) rating = rm2[1];
            }

            if (name) items.push({property_name: name, price_per_night: price, bedrooms, bathrooms, guest_capacity: guests, rating});
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = LuxePropertyItem()
        item.property_name = d.get("property_name", "")
        item.price_per_night = d.get("price_per_night", "")
        item.bedrooms = d.get("bedrooms", "")
        item.bathrooms = d.get("bathrooms", "")
        item.guest_capacity = d.get("guest_capacity", "")
        item.rating = d.get("rating", "")
        result.items.append(item)

    print(f"\\nFound {len(result.items)} luxury properties in '{request.location}':")
    for i, item in enumerate(result.items, 1):
        print(f"\\n  {i}. {item.property_name}")
        print(f"     Price:    {item.price_per_night}")
        print(f"     Bedrooms: {item.bedrooms}")
        print(f"     Baths:    {item.bathrooms}")
        print(f"     Guests:   {item.guest_capacity}")
        print(f"     Rating:   {item.rating}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("airbnb_luxe")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            result = search_airbnb_luxe(page, AirbnbLuxeSearchRequest())
            print("\\n=== DONE ===")
            print(f"Found {len(result.items)} listings")
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
    const encoded = encodeURIComponent(CFG.location);
    await page.goto(`https://www.airbnb.com/s/${encoded}/homes?refinement_paths%5B%5D=%2Fluxe`, { waitUntil: "domcontentloaded" });
    recorder.goto(`https://www.airbnb.com/s/${encoded}/homes?refinement_paths%5B%5D=%2Fluxe`);
    await page.waitForTimeout(CFG.waits.page);
    const data = await stagehand.extract(`Extract the top ${CFG.maxResults} luxury property listings with name, price per night, bedrooms, bathrooms, guest capacity, and rating.`);
    recorder.record("extract", { description: "luxury listings", results: data });
    console.log("Extracted:", JSON.stringify(data, null, 2));
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    fs.writeFileSync(path.join(__dirname, "airbnb_luxe_search.py"), genPython(CFG, recorder));
    console.log("Saved airbnb_luxe_search.py");
  } finally { await stagehand.close(); }
})();
