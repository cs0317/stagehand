const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  artist: "Beyonce",
  maxEvents: 5,
  waits: { page: 5000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Bandsintown – Concert Search
Artist: "${cfg.artist}"

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
class ConcertRequest:
    artist: str = "${cfg.artist}"
    max_events: int = ${cfg.maxEvents}


@dataclass
class Concert:
    venue: str = ""
    city: str = ""
    date: str = ""
    ticket_url: str = ""


@dataclass
class ConcertResult:
    events: list = field(default_factory=list)


def bandsintown_search(page: Page, request: ConcertRequest) -> ConcertResult:
    """Search Bandsintown for upcoming concerts."""
    print(f"  Artist: {request.artist}\\n")

    url = f"https://www.bandsintown.com/a/1-{quote_plus(request.artist.lower())}"
    print(f"Loading {url}...")
    checkpoint("Navigate to artist page")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    checkpoint("Extract concert events")
    events_data = page.evaluate(r"""(maxEvents) => {
        const results = [];
        const items = document.querySelectorAll(
            '[class*="event"], [data-testid*="event"], [class*="Event"], li[class*="concert"]'
        );
        for (const item of items) {
            if (results.length >= maxEvents) break;
            const text = item.innerText || '';
            const lines = text.split('\\n').map(l => l.trim()).filter(Boolean);
            if (lines.length < 2) continue;

            let venue = '', city = '', date = '', ticket_url = '';

            const linkEl = item.querySelector('a[href*="ticket"], a[href*="event"]');
            ticket_url = linkEl ? linkEl.href : '';

            for (const line of lines) {
                if (/\\d{4}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i.test(line) && line.length < 40 && !date) {
                    date = line;
                } else if (!venue && line.length > 3 && line.length < 80 && !/ticket|rsvp|interested/i.test(line)) {
                    venue = line;
                } else if (!city && line.length > 3 && line.length < 60 && /,/.test(line)) {
                    city = line;
                }
            }
            if (venue) results.push({ venue, city, date, ticket_url });
        }
        return results;
    }""", request.max_events)

    result = ConcertResult(events=[Concert(**e) for e in events_data])

    print("\\n" + "=" * 60)
    print(f"Bandsintown: {request.artist}")
    print("=" * 60)
    for e in result.events:
        print(f"  {e.venue}")
        print(f"    City: {e.city}  Date: {e.date}")
        print(f"    Tickets: {e.ticket_url}")
    print(f"\\n  Total: {len(result.events)} events")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("bandsintown_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = bandsintown_search(page, ConcertRequest())
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
    const url = `https://www.bandsintown.com/a/1-${encodeURIComponent(CFG.artist.toLowerCase())}`;
    console.log(`\n🌐 Loading: ${url}...`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url, description: "Navigate to artist page" });

    const eventsData = await stagehand.extract(
      "extract up to 5 upcoming concert events with venue name, city, date, and ticket URL"
    );
    console.log("\n📊 Events:", JSON.stringify(eventsData, null, 2));
    recorder.record("extract", { instruction: "Extract concerts", results: eventsData });

    const dir = path.join(__dirname);
    fs.writeFileSync(path.join(dir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    console.log(`\n💾 Saved ${recorder.actions.length} actions`);

    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(dir, "bandsintown_search.py"), pyCode);
    console.log("🐍 Saved Python script");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
