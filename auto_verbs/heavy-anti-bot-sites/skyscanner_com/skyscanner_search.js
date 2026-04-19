const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Skyscanner – Search for flights by origin, destination, and departure date
 */

const CFG = {
  origin: "SFO",
  destination: "LAX",
  departureDate: "2025-02-01",
  maxResults: 5,
  waits: { page: 8000, action: 2000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Skyscanner – Search for flights by origin, destination, and departure date

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
class SkyscannerSearchRequest:
    origin: str = "${cfg.origin}"
    destination: str = "${cfg.destination}"
    departure_date: str = "${cfg.departureDate}"
    max_results: int = ${cfg.maxResults}


@dataclass
class SkyscannerFlightItem:
    airline: str = ""
    departure_time: str = ""
    arrival_time: str = ""
    duration: str = ""
    stops: str = ""
    price: str = ""


@dataclass
class SkyscannerSearchResult:
    items: List[SkyscannerFlightItem] = field(default_factory=list)


# Search for flights on Skyscanner by origin, destination, and departure date.
def skyscanner_search(page: Page, request: SkyscannerSearchRequest) -> SkyscannerSearchResult:
    """Search for flights on Skyscanner."""
    print(f"  Origin: {request.origin}, Destination: {request.destination}, Date: {request.departure_date}\\n")

    date_formatted = request.departure_date.replace("-", "")[2:]  # YYMMDD
    url = f"https://www.skyscanner.com/transport/flights/{request.origin.lower()}/{request.destination.lower()}/{date_formatted}/"
    print(f"Loading {url}...")
    checkpoint("Navigate to Skyscanner flight search results")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(8000)

    result = SkyscannerSearchResult()

    checkpoint("Extract flight listings")
    js_code = """(max) => {
        const cards = document.querySelectorAll('[class*="FlightsResults"] [class*="itinerary"], [class*="ItineraryCard"], [class*="result-item"], [class*="BpkTicket"], article[class*="flight"]');
        const items = [];
        for (const card of cards) {
            if (items.length >= max) break;
            const airlineEl = card.querySelector('[class*="carrier"], [class*="airline"], [class*="Carrier"], img[alt]');
            const depTimeEl = card.querySelector('[class*="depart"] [class*="time"], [class*="TimePlace"]:first-child [class*="time"], [class*="departure"] [class*="time"]');
            const arrTimeEl = card.querySelector('[class*="arrive"] [class*="time"], [class*="TimePlace"]:last-child [class*="time"], [class*="arrival"] [class*="time"]');
            const durationEl = card.querySelector('[class*="duration"], [class*="Duration"]');
            const stopsEl = card.querySelector('[class*="stop"], [class*="Stop"]');
            const priceEl = card.querySelector('[class*="price"], [class*="Price"], [class*="cost"]');

            const airline = airlineEl ? (airlineEl.alt || airlineEl.textContent.trim()) : '';
            const departure_time = depTimeEl ? depTimeEl.textContent.trim() : '';
            const arrival_time = arrTimeEl ? arrTimeEl.textContent.trim() : '';
            const duration = durationEl ? durationEl.textContent.trim() : '';
            const stops = stopsEl ? stopsEl.textContent.trim() : '';
            const price = priceEl ? priceEl.textContent.trim() : '';

            if (airline || departure_time || price) {
                items.push({airline, departure_time, arrival_time, duration, stops, price});
            }
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = SkyscannerFlightItem()
        item.airline = d.get("airline", "")
        item.departure_time = d.get("departure_time", "")
        item.arrival_time = d.get("arrival_time", "")
        item.duration = d.get("duration", "")
        item.stops = d.get("stops", "")
        item.price = d.get("price", "")
        result.items.append(item)

    for i, item in enumerate(result.items, 1):
        print(f"\\n  Flight {i}:")
        print(f"    Airline:   {item.airline}")
        print(f"    Depart:    {item.departure_time}")
        print(f"    Arrive:    {item.arrival_time}")
        print(f"    Duration:  {item.duration}")
        print(f"    Stops:     {item.stops}")
        print(f"    Price:     {item.price}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("skyscanner")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            request = SkyscannerSearchRequest()
            result = skyscanner_search(page, request)
            print("\\n=== DONE ===")
            print(f"Found {len(result.items)} flights")
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
    const dateFmt = CFG.departureDate.replace(/-/g, "").slice(2);
    const url = `https://www.skyscanner.com/transport/flights/${CFG.origin.toLowerCase()}/${CFG.destination.toLowerCase()}/${dateFmt}/`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    recorder.record("navigate", url, `Navigate to ${url}`);
    await page.waitForTimeout(CFG.waits.page);

    const data = await stagehand.extract(
      `Extract the first ${CFG.maxResults} flight results. For each get the airline, departure time, arrival time, duration, stops, and price.`
    );
    recorder.record("extract", "flight results", JSON.stringify(data));
    console.log("Extracted:", JSON.stringify(data, null, 2));

    const outDir = __dirname;
    fs.writeFileSync(path.join(outDir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    fs.writeFileSync(path.join(outDir, "skyscanner_search.py"), genPython(CFG, recorder));
    console.log("Saved skyscanner_search.py");
  } finally {
    await stagehand.close();
  }
})();
