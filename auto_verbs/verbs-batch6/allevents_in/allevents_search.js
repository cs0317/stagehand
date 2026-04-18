const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * AllEvents – Event Search
 *
 * Searches allevents.in for events in a city matching a query.
 */

const CFG = {
  city: "Austin",
  query: "music festival",
  maxResults: 5,
  waits: { page: 5000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
AllEvents – Event Search
City: "${cfg.city}", Query: "${cfg.query}"

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
class EventSearchRequest:
    city: str = "${cfg.city}"
    query: str = "${cfg.query}"
    max_results: int = ${cfg.maxResults}


@dataclass
class Event:
    event_name: str = ""
    date: str = ""
    venue: str = ""
    event_url: str = ""


@dataclass
class EventSearchResult:
    events: list = field(default_factory=list)


def allevents_search(page: Page, request: EventSearchRequest) -> EventSearchResult:
    """Search AllEvents for events."""
    print(f"  City: {request.city}")
    print(f"  Query: {request.query}\\n")

    search_url = f"https://allevents.in/{request.city.lower()}?q={quote_plus(request.query)}"
    print(f"Loading {search_url}...")
    checkpoint("Navigate to AllEvents search")
    page.goto(search_url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    # Dismiss popups
    for sel in ["button:has-text('Accept')", "button:has-text('Got it')", "button[aria-label='Close']"]:
        try:
            btn = page.locator(sel).first
            if btn.is_visible(timeout=2000):
                btn.click()
                page.wait_for_timeout(500)
        except Exception:
            pass

    # Extract events
    checkpoint("Extract events")
    events = page.evaluate(r"""(maxResults) => {
        const results = [];
        const cards = document.querySelectorAll(
            '.event-card, .item, article, [itemtype*="Event"], .event-item, a[href*="/e/"]'
        );
        const seen = new Set();
        for (const card of cards) {
            if (results.length >= maxResults) break;
            const nameEl = card.querySelector('h2, h3, h4, .event-title, .title, [itemprop="name"]');
            const dateEl = card.querySelector('time, .event-date, .date, [itemprop="startDate"], .when');
            const venueEl = card.querySelector('.venue, .location, [itemprop="location"], .where');
            const linkEl = card.tagName === 'A' ? card : card.querySelector('a[href*="/e/"]') || card.querySelector('a');

            const name = nameEl ? nameEl.innerText.trim() : (card.tagName === 'A' ? card.innerText.split('\\n')[0].trim() : '');
            if (!name || name.length < 3 || seen.has(name)) continue;
            seen.add(name);

            const date = dateEl ? dateEl.innerText.trim() : '';
            const venue = venueEl ? venueEl.innerText.trim() : '';
            const url = linkEl ? linkEl.href : '';

            results.push({ event_name: name, date, venue, event_url: url });
        }
        return results;
    }""", request.max_results)

    print("\\n" + "=" * 60)
    print(f"AllEvents: {request.query} in {request.city}")
    print("=" * 60)
    for idx, e in enumerate(events, 1):
        print(f"\\n  {idx}. {e['event_name']}")
        print(f"     Date: {e['date']}")
        print(f"     Venue: {e['venue']}")
        print(f"     URL: {e['event_url']}")

    result_events = [Event(**e) for e in events]
    print(f"\\nFound {len(result_events)} events")
    return EventSearchResult(events=result_events)


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("allevents_in")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = allevents_search(page, EventSearchRequest())
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
    const searchUrl = `https://allevents.in/${CFG.city.toLowerCase()}?q=${encodeURIComponent(CFG.query)}`;
    console.log(`\n🌐 Searching: ${searchUrl}...`);
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url: searchUrl, description: "Search AllEvents" });

    const events = await page.evaluate((maxResults) => {
      const results = [];
      const cards = document.querySelectorAll(
        '.event-card, .item, article, [itemtype*="Event"], .event-item, a[href*="/e/"]'
      );
      const seen = new Set();
      for (const card of cards) {
        if (results.length >= maxResults) break;
        const nameEl = card.querySelector("h2, h3, h4, .event-title, .title");
        const dateEl = card.querySelector("time, .event-date, .date");
        const venueEl = card.querySelector(".venue, .location");
        const linkEl = card.tagName === "A" ? card : card.querySelector('a[href*="/e/"]') || card.querySelector("a");
        const name = nameEl ? nameEl.innerText.trim() : (card.tagName === "A" ? card.innerText.split("\n")[0].trim() : "");
        if (!name || name.length < 3 || seen.has(name)) continue;
        seen.add(name);
        const date = dateEl ? dateEl.innerText.trim() : "";
        const venue = venueEl ? venueEl.innerText.trim() : "";
        const url = linkEl ? linkEl.href : "";
        results.push({ event_name: name, date, venue, event_url: url });
      }
      return results;
    }, CFG.maxResults);

    recorder.record("extract", {
      instruction: "Extract events",
      description: `Extracted ${events.length} events`,
      results: events,
    });

    console.log("\n" + "=".repeat(60));
    console.log(`AllEvents: ${CFG.query} in ${CFG.city}`);
    console.log("=".repeat(60));
    events.forEach((e, i) => {
      console.log(`\n  ${i + 1}. ${e.event_name}`);
      console.log(`     Date: ${e.date}`);
      console.log(`     Venue: ${e.venue}`);
      console.log(`     URL: ${e.event_url}`);
    });

    const dir = path.join(__dirname);
    fs.writeFileSync(path.join(dir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    console.log(`\n💾 Saved ${recorder.actions.length} actions`);

    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(dir, "allevents_search.py"), pyCode);
    console.log("🐍 Saved Python script");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
