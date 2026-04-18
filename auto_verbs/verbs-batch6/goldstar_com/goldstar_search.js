const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  location: "New York",
  maxResults: 5,
  waits: { page: 5000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Goldstar – Discount Event Tickets
Location: "${cfg.location}"

Generated on: ${ts}
Recorded ${n} browser interactions
"""

import re
import os, sys, shutil
from dataclasses import dataclass, field
from urllib.parse import quote_plus
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class EventRequest:
    location: str = "${cfg.location}"
    max_results: int = ${cfg.maxResults}


@dataclass
class Event:
    name: str = ""
    venue: str = ""
    date: str = ""
    original_price: str = ""
    discount_price: str = ""


@dataclass
class EventResult:
    events: list = field(default_factory=list)


def goldstar_search(page: Page, request: EventRequest) -> EventResult:
    """Search Goldstar for discount events."""
    print(f"  Location: {request.location}\\n")

    url = f"https://www.goldstar.com/new-york"
    print(f"Loading {url}...")
    checkpoint("Navigate to Goldstar")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    checkpoint("Extract event listings")
    items_data = page.evaluate(r"""(maxResults) => {
        const results = [];
        const items = document.querySelectorAll(
            '[class*="event-card"], [class*="listing"], article, [class*="card"]'
        );
        const seen = new Set();
        for (const item of items) {
            if (results.length >= maxResults) break;
            const titleEl = item.querySelector('h2, h3, h4, [class*="title"], [class*="name"]');
            const name = titleEl ? titleEl.innerText.trim() : '';
            if (!name || name.length < 3 || seen.has(name)) continue;
            seen.add(name);

            const text = item.innerText || '';
            let venue = '', date = '', original_price = '', discount_price = '';

            const venueEl = item.querySelector('[class*="venue"], [class*="location"]');
            if (venueEl) venue = venueEl.innerText.trim();

            const dateEl = item.querySelector('[class*="date"], time');
            if (dateEl) date = dateEl.innerText.trim();

            const prices = text.match(/\\$(\\d[\\d,.]*)/g) || [];
            if (prices.length >= 2) {
                original_price = prices[0];
                discount_price = prices[1];
            } else if (prices.length === 1) {
                discount_price = prices[0];
            }

            results.push({ name, venue, date, original_price, discount_price });
        }
        return results;
    }""", request.max_results)

    result = EventResult(events=[Event(**e) for e in items_data])

    print("\\n" + "=" * 60)
    print(f"Goldstar: {request.location}")
    print("=" * 60)
    for e in result.events:
        print(f"  {e.name}")
        print(f"    Venue: {e.venue}  Date: {e.date}")
        print(f"    Price: {e.original_price} -> {e.discount_price}")
    print(f"\\n  Total: {len(result.events)} events")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("goldstar_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = goldstar_search(page, EventRequest())
            print(f"\\nReturned {len(result.events)} events")
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
  const stagehand = new Stagehand({
    env: "LOCAL",
    verbose: 1,
    llmClient,
    localBrowserLaunchOptions: {
      headless: false,
      args: ["--disable-blink-features=AutomationControlled", "--start-maximized"],
    },
  });
  await stagehand.init();
  const page = stagehand.context.pages()[0];
  const recorder = new PlaywrightRecorder();

  try {
    const url = "https://www.goldstar.com/new-york";
    console.log(`\n🌐 Loading: ${url}...`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url, description: "Navigate to Goldstar" });

    const events = await stagehand.extract(
      "extract up to 5 events with event name, venue, date, original price, and discount price"
    );
    console.log("\n📊 Events:", JSON.stringify(events, null, 2));
    recorder.record("extract", { instruction: "Extract events", results: events });

    const dir = path.join(__dirname);
    fs.writeFileSync(path.join(dir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    console.log(`\n💾 Saved ${recorder.actions.length} actions`);

    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(dir, "goldstar_search.py"), pyCode);
    console.log("🐍 Saved Python script");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
