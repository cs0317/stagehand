const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Secret Flying – Browse cheap flight deals by region
 */

const CFG = {
  region: "usa",
  maxResults: 10,
  waits: { page: 5000, action: 2000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Secret Flying – Browse cheap flight deals by region

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
class SecretflyingSearchRequest:
    region: str = "${cfg.region}"
    max_results: int = ${cfg.maxResults}


@dataclass
class SecretflyingDealItem:
    origin: str = ""
    destination: str = ""
    price: str = ""
    airline: str = ""
    travel_dates: str = ""
    deal_type: str = ""


@dataclass
class SecretflyingSearchResult:
    items: List[SecretflyingDealItem] = field(default_factory=list)


# Browse cheap flight deals on Secret Flying by region.
def secretflying_search(page: Page, request: SecretflyingSearchRequest) -> SecretflyingSearchResult:
    """Browse cheap flight deals on Secret Flying."""
    print(f"  Region: {request.region}\\n")

    url = f"https://www.secretflying.com/deals/{request.region}/"
    print(f"Loading {url}...")
    checkpoint("Navigate to Secret Flying deals page")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    result = SecretflyingSearchResult()

    checkpoint("Extract deal listings")
    js_code = """(max) => {
        const cards = document.querySelectorAll('[class*="deal"], [class*="Deal"], article, [class*="post"], [class*="card"], .listing');
        const items = [];
        for (const card of cards) {
            if (items.length >= max) break;
            const titleEl = card.querySelector('h2, h3, h4, [class*="title"], [class*="headline"], a');
            const priceEl = card.querySelector('[class*="price"], [class*="cost"], [class*="Price"]');
            const airlineEl = card.querySelector('[class*="airline"], [class*="carrier"]');
            const datesEl = card.querySelector('[class*="date"], [class*="travel"], time');
            const typeEl = card.querySelector('[class*="type"], [class*="category"], [class*="label"], [class*="tag"]');

            const fullTitle = titleEl ? titleEl.textContent.trim() : '';
            let origin = '';
            let destination = '';
            // Try to parse "City to City" from title
            const match = fullTitle.match(/(.+?)\\s+to\\s+(.+?)(?:\\s+from|\\s+for|\\s*\\$|$)/i);
            if (match) {
                origin = match[1].trim();
                destination = match[2].trim();
            } else {
                destination = fullTitle;
            }
            const price = priceEl ? priceEl.textContent.trim() : '';
            const airline = airlineEl ? airlineEl.textContent.trim() : '';
            const travel_dates = datesEl ? (datesEl.getAttribute('datetime') || datesEl.textContent.trim()) : '';
            const deal_type = typeEl ? typeEl.textContent.trim() : '';

            if (fullTitle) {
                items.push({origin, destination, price, airline, travel_dates, deal_type});
            }
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = SecretflyingDealItem()
        item.origin = d.get("origin", "")
        item.destination = d.get("destination", "")
        item.price = d.get("price", "")
        item.airline = d.get("airline", "")
        item.travel_dates = d.get("travel_dates", "")
        item.deal_type = d.get("deal_type", "")
        result.items.append(item)

    for i, item in enumerate(result.items, 1):
        print(f"\\n  Deal {i}:")
        print(f"    Origin:      {item.origin}")
        print(f"    Destination: {item.destination}")
        print(f"    Price:       {item.price}")
        print(f"    Airline:     {item.airline}")
        print(f"    Dates:       {item.travel_dates}")
        print(f"    Type:        {item.deal_type}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("secretflying")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            request = SecretflyingSearchRequest()
            result = secretflying_search(page, request)
            print("\\n=== DONE ===")
            print(f"Found {len(result.items)} deals")
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
    const url = `https://www.secretflying.com/deals/${CFG.region}/`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    recorder.record("navigate", url, `Navigate to ${url}`);
    await page.waitForTimeout(CFG.waits.page);

    const data = await stagehand.extract(
      `Extract the first ${CFG.maxResults} flight deal results. For each get the origin, destination, price, airline, travel dates, and deal type.`
    );
    recorder.record("extract", "deal listings", JSON.stringify(data));
    console.log("Extracted:", JSON.stringify(data, null, 2));

    const outDir = __dirname;
    fs.writeFileSync(path.join(outDir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    fs.writeFileSync(path.join(outDir, "secretflying_search.py"), genPython(CFG, recorder));
    console.log("Saved secretflying_search.py");
  } finally {
    await stagehand.close();
  }
})();
