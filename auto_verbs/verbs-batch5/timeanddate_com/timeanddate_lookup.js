const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Time and Date – Look Up Current Time
 *
 * Searches timeanddate.com for a city and extracts current local time,
 * date, timezone abbreviation, and UTC offset.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  city: "Tokyo",
  waits: { page: 5000 },
};

// ── Python Script Generator ──────────────────────────────────────────────────
function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Time and Date – Look Up Current Time
City: "${cfg.city}"

Generated on: ${ts}
Recorded ${n} browser interactions

Uses Playwright's native locator API with the user's Chrome profile.
"""

import re
import os, sys, shutil
from dataclasses import dataclass
from urllib.parse import quote_plus
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class TimeRequest:
    city: str = "${cfg.city}"


@dataclass
class TimeResult:
    city_name: str = ""
    current_time: str = ""
    date: str = ""
    timezone_abbr: str = ""
    utc_offset: str = ""


def time_lookup(page: Page, request: TimeRequest) -> TimeResult:
    """Look up the current time for a city on timeanddate.com."""
    print(f"  City: {request.city}\\n")

    # ── Search ────────────────────────────────────────────────────────
    search_url = f"https://www.timeanddate.com/worldclock/results.html?query={quote_plus(request.city)}"
    print(f"Loading {search_url}...")
    checkpoint("Navigate to search results")
    page.goto(search_url, wait_until="domcontentloaded")
    page.wait_for_timeout(3000)

    # ── Find first city link ──────────────────────────────────────────
    city_url = page.evaluate(r"""(cityName) => {
        const links = document.querySelectorAll('table.zebra tr td a');
        for (const link of links) {
            if (link.href && link.href.includes('/worldclock/')) {
                return link.href;
            }
        }
        return null;
    }""", request.city)

    if not city_url:
        print("No city found!")
        return TimeResult()

    print(f"City page: {city_url}")
    checkpoint("Navigate to city page")
    page.goto(city_url, wait_until="domcontentloaded")
    page.wait_for_timeout(3000)

    # ── Extract time data ─────────────────────────────────────────────
    data = page.evaluate(r"""() => {
        const ct = document.querySelector('#ct');
        const cta = document.querySelector('#cta');
        const ctdat = document.querySelector('#ctdat');
        const title = document.title;
        const cityMatch = title.match(/Current Local Time in (.+)/);
        const utcMatch = document.body.innerText.match(/UTC\\/GMT\\s*([+-]?\\d+\\s*hours?)/i);
        return {
            city_name: cityMatch ? cityMatch[1] : '',
            current_time: ct ? ct.innerText.trim() : '',
            date: ctdat ? ctdat.innerText.trim() : '',
            timezone_abbr: cta ? cta.innerText.trim() : '',
            utc_offset: utcMatch ? utcMatch[0] : '',
        };
    }""")

    # ── Print results ─────────────────────────────────────────────────
    print("\\n" + "=" * 60)
    print(f"Current Time: {request.city}")
    print("=" * 60)
    print(f"  City: {data['city_name']}")
    print(f"  Time: {data['current_time']}")
    print(f"  Date: {data['date']}")
    print(f"  Timezone: {data['timezone_abbr']}")
    print(f"  UTC Offset: {data['utc_offset']}")

    return TimeResult(**data)


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("timeanddate_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = time_lookup(page, TimeRequest())
            print(f"\\nResult: {result}")
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
    // Step 1: Search for city
    const searchUrl = `https://www.timeanddate.com/worldclock/results.html?query=${encodeURIComponent(CFG.city)}`;
    console.log(`\n🌐 Searching: ${searchUrl}...`);
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(3000);
    recorder.record("goto", { url: searchUrl, description: "Search for city" });

    // Step 2: Find first city link
    const cityUrl = await page.evaluate(() => {
      const links = document.querySelectorAll("table.zebra tr td a");
      for (const link of links) {
        if (link.href && link.href.includes("/worldclock/")) return link.href;
      }
      return null;
    });

    if (!cityUrl) throw new Error("No city found");
    console.log(`📍 City page: ${cityUrl}`);

    await page.goto(cityUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url: cityUrl, description: "Navigate to city page" });

    // Step 3: Extract time data
    const data = await page.evaluate(() => {
      const ct = document.querySelector("#ct");
      const cta = document.querySelector("#cta");
      const ctdat = document.querySelector("#ctdat");
      const title = document.title;
      const cityMatch = title.match(/Current Local Time in (.+)/);
      const utcMatch = document.body.innerText.match(/UTC\/GMT\s*([+-]?\d+\s*hours?)/i);
      return {
        city_name: cityMatch ? cityMatch[1] : "",
        current_time: ct ? ct.innerText.trim() : "",
        date: ctdat ? ctdat.innerText.trim() : "",
        timezone_abbr: cta ? cta.innerText.trim() : "",
        utc_offset: utcMatch ? utcMatch[0] : "",
      };
    });

    recorder.record("extract", {
      instruction: "Extract time data",
      description: `Extracted time for ${data.city_name}`,
      results: data,
    });

    console.log("\n" + "=".repeat(60));
    console.log(`Current Time: ${CFG.city}`);
    console.log("=".repeat(60));
    console.log(`  City: ${data.city_name}`);
    console.log(`  Time: ${data.current_time}`);
    console.log(`  Date: ${data.date}`);
    console.log(`  Timezone: ${data.timezone_abbr}`);
    console.log(`  UTC Offset: ${data.utc_offset}`);

    const dir = path.join(__dirname);
    fs.writeFileSync(
      path.join(dir, "recorded_actions.json"),
      JSON.stringify(recorder.actions, null, 2)
    );
    console.log(`\n💾 Saved ${recorder.actions.length} actions`);

    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(dir, "timeanddate_lookup.py"), pyCode);
    console.log("🐍 Saved Python script");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
