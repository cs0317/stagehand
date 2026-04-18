const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Songkick – Upcoming Concerts by City
 *
 * Searches songkick.com for upcoming concerts in a city and extracts
 * artist name, venue, and date.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  city: "Los Angeles",
  maxEvents: 5,
  waits: { page: 5000 },
};

// ── Python Script Generator ──────────────────────────────────────────────────
function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Songkick – Upcoming Concerts
City: "${cfg.city}"

Generated on: ${ts}
Recorded ${n} browser interactions

Uses Playwright's native locator API with the user's Chrome profile.
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
class SongkickRequest:
    city: str = "${cfg.city}"
    max_events: int = ${cfg.maxEvents}


@dataclass
class ConcertEvent:
    artist: str = ""
    venue: str = ""
    city: str = ""
    date: str = ""


@dataclass
class SongkickResult:
    events: list = field(default_factory=list)


def songkick_concerts(page: Page, request: SongkickRequest) -> SongkickResult:
    """Search songkick.com for upcoming concerts."""
    print(f"  City: {request.city}\\n")

    # ── Search for the city ───────────────────────────────────────────
    search_url = f"https://www.songkick.com/search?query={quote_plus(request.city)}&type=cities"
    print(f"Loading {search_url}...")
    checkpoint("Search songkick for city")
    page.goto(search_url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    # Find the metro area link matching the city
    metro_url = page.evaluate(r"""(city) => {
        const links = document.querySelectorAll('a[href*="/metro-areas/"]');
        const cityLower = city.toLowerCase();
        for (const link of links) {
            const text = link.textContent.toLowerCase();
            if (text.includes(cityLower) && link.href.includes('/metro-areas/')) return link.href;
        }
        return null;
    }""", request.city)

    if metro_url:
        print(f"Navigating to metro area: {metro_url}")
        checkpoint("Navigate to metro area")
        page.goto(metro_url, wait_until="domcontentloaded")
        page.wait_for_timeout(5000)

    # ── Extract events ────────────────────────────────────────────────
    raw_events = page.evaluate(r"""(maxEvents) => {
        const container = document.querySelector('ul.component.metro-area-calendar-listings');
        if (!container) return [];
        const children = container.children;
        let currentDate = '';
        const results = [];
        for (const child of children) {
            if (child.classList.contains('date-element')) {
                currentDate = child.innerText.trim();
            } else if (child.classList.contains('event-listings-element')) {
                if (results.length >= maxEvents) break;
                const artistEl = child.querySelector('p.artists a.event-link');
                const venueSpans = child.querySelectorAll('p.location span');
                results.push({
                    artist: artistEl ? artistEl.innerText.trim() : '',
                    venue: venueSpans[0] ? venueSpans[0].innerText.trim() : '',
                    city: venueSpans[1] ? venueSpans[1].innerText.trim() : '',
                    date: currentDate,
                });
            }
        }
        return results;
    }""", request.max_events)

    # ── Print results ─────────────────────────────────────────────────
    print("\\n" + "=" * 60)
    print(f"Upcoming concerts in {request.city}")
    print("=" * 60)
    for idx, e in enumerate(raw_events, 1):
        print(f"\\n  {idx}. {e['artist']}")
        print(f"     Venue: {e['venue']}")
        print(f"     Location: {e['city']}")
        print(f"     Date: {e['date']}")

    events = [ConcertEvent(**e) for e in raw_events]
    return SongkickResult(events=events)


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("songkick_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = songkick_concerts(page, SongkickRequest())
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

// ── Main ─────────────────────────────────────────────────────────────────────
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
    // Search for the city (locations tab)
    const searchUrl = `https://www.songkick.com/search?query=${encodeURIComponent(CFG.city)}&type=cities`;
    console.log(`\n🌐 Searching: ${searchUrl}...`);
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url: searchUrl, description: "Search songkick for city" });

    // Find metro area link matching city
    const metroUrl = await page.evaluate((city) => {
      const links = document.querySelectorAll('a[href*="/metro-areas/"]');
      const cityLower = city.toLowerCase();
      for (const link of links) {
        const text = link.textContent.toLowerCase();
        if (text.includes(cityLower) && link.href.includes("/metro-areas/")) return link.href;
      }
      return null;
    }, CFG.city);

    if (metroUrl) {
      console.log(`📍 Metro area: ${metroUrl}`);
      await page.goto(metroUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(CFG.waits.page);
      recorder.record("goto", { url: metroUrl, description: "Navigate to metro area" });
    }

    const events = await page.evaluate((maxEvents) => {
      const container = document.querySelector("ul.component.metro-area-calendar-listings");
      if (!container) return [];
      const children = container.children;
      let currentDate = "";
      const results = [];
      for (const child of children) {
        if (child.classList.contains("date-element")) {
          currentDate = child.innerText.trim();
        } else if (child.classList.contains("event-listings-element")) {
          if (results.length >= maxEvents) break;
          const artistEl = child.querySelector("p.artists a.event-link");
          const venueSpans = child.querySelectorAll("p.location span");
          results.push({
            artist: artistEl ? artistEl.innerText.trim() : "",
            venue: venueSpans[0] ? venueSpans[0].innerText.trim() : "",
            city: venueSpans[1] ? venueSpans[1].innerText.trim() : "",
            date: currentDate,
          });
        }
      }
      return results;
    }, CFG.maxEvents);

    recorder.record("extract", {
      instruction: "Extract concert events",
      description: `Extracted ${events.length} events`,
      results: events,
    });

    console.log("\n" + "=".repeat(60));
    console.log(`Upcoming concerts in ${CFG.city}`);
    console.log("=".repeat(60));
    events.forEach((e, i) => {
      console.log(`\n  ${i + 1}. ${e.artist}`);
      console.log(`     Venue: ${e.venue}`);
      console.log(`     Location: ${e.city}`);
      console.log(`     Date: ${e.date}`);
    });

    const dir = path.join(__dirname);
    fs.writeFileSync(
      path.join(dir, "recorded_actions.json"),
      JSON.stringify(recorder.actions, null, 2)
    );
    console.log(`\n💾 Saved ${recorder.actions.length} actions`);

    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(dir, "songkick_concerts.py"), pyCode);
    console.log("🐍 Saved Python script");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
