const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Athlinks – Search Race Results
 *
 * Searches athlinks.com for race results and extracts
 * runner name, bib number, finish time, overall place, age group, and age group place.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  raceName: "Boston Marathon",
  maxResults: 5,
  waits: { page: 5000 },
};

// ── Python Script Generator ──────────────────────────────────────────────────
function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Athlinks – Search Race Results
Race: "${cfg.raceName}"

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
class AthlinksRequest:
    race_name: str = "${cfg.raceName}"
    max_results: int = ${cfg.maxResults}


@dataclass
class RaceResult:
    runner_name: str = ""
    bib_number: str = ""
    finish_time: str = ""
    overall_place: str = ""
    age_group: str = ""
    age_group_place: str = ""


@dataclass
class AthlinksResult:
    results: list = field(default_factory=list)


def athlinks_search(page: Page, request: AthlinksRequest) -> AthlinksResult:
    """Search athlinks.com for race results."""
    print(f"  Race: {request.race_name}\\n")

    # ── Search ────────────────────────────────────────────────────────
    search_url = f"https://www.athlinks.com/search/events?query={quote_plus(request.race_name)}"
    print(f"Loading {search_url}...")
    checkpoint("Navigate to Athlinks search")
    page.goto(search_url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    # ── Click first event result ──────────────────────────────────────
    first_event = page.query_selector('a[href*="/event/"], div[class*="event-card"] a, div[class*="EventCard"] a')
    if first_event:
        checkpoint("Click first event result")
        first_event.click()
        page.wait_for_timeout(5000)

    # ── Extract race results ──────────────────────────────────────────
    raw_results = page.evaluate(r"""(maxResults) => {
        const rows = document.querySelectorAll('tr[data-testid="result-row"], table tbody tr, div[class*="result-row"], div[class*="ResultRow"]');
        const results = [];
        for (let i = 0; i < Math.min(rows.length, maxResults); i++) {
            const row = rows[i];
            const cells = row.querySelectorAll('td, div[class*="cell"]');
            const nameEl = row.querySelector('a[class*="name"], td:nth-child(2), [class*="athlete-name"]');
            const bibEl = row.querySelector('[class*="bib"], td:nth-child(1)');
            const timeEl = row.querySelector('[class*="time"], [class*="finish"], td:last-child');
            const placeEl = row.querySelector('[class*="place"], [class*="overall"], td:nth-child(3)');
            const agEl = row.querySelector('[class*="age-group"], [class*="division"]');
            const agPlaceEl = row.querySelector('[class*="ag-place"], [class*="division-place"]');

            results.push({
                runner_name: nameEl ? nameEl.innerText.trim() : '',
                bib_number: bibEl ? bibEl.innerText.trim() : '',
                finish_time: timeEl ? timeEl.innerText.trim() : '',
                overall_place: placeEl ? placeEl.innerText.trim() : '',
                age_group: agEl ? agEl.innerText.trim() : '',
                age_group_place: agPlaceEl ? agPlaceEl.innerText.trim() : '',
            });
        }
        return results;
    }""", request.max_results)

    # ── Print results ─────────────────────────────────────────────────
    print("\\n" + "=" * 60)
    print(f"Athlinks: {request.race_name}")
    print("=" * 60)
    for idx, r in enumerate(raw_results, 1):
        print(f"\\n  {idx}. {r['runner_name']}")
        print(f"     Bib: {r['bib_number']}")
        print(f"     Time: {r['finish_time']}")
        print(f"     Overall: {r['overall_place']}")
        if r['age_group']:
            print(f"     Age Group: {r['age_group']} (Place: {r['age_group_place']})")

    results = [RaceResult(**r) for r in raw_results]
    return AthlinksResult(results=results)


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("athlinks_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = athlinks_search(page, AthlinksRequest())
            print(f"\\nReturned {len(result.results)} results")
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
    const searchUrl = `https://www.athlinks.com/search/events?query=${encodeURIComponent(CFG.raceName)}`;
    console.log(`\n🌐 Searching: ${searchUrl}...`);
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url: searchUrl, description: "Search Athlinks" });

    // Click first event result
    const firstEvent = await page.$('a[href*="/event/"], div[class*="event-card"] a, div[class*="EventCard"] a');
    if (firstEvent) {
      await firstEvent.click();
      await page.waitForTimeout(CFG.waits.page);
      recorder.record("click", { description: "Click first event result" });
    }

    const results = await page.evaluate((maxResults) => {
      const rows = document.querySelectorAll('tr[data-testid="result-row"], table tbody tr, div[class*="result-row"], div[class*="ResultRow"]');
      const res = [];
      for (let i = 0; i < Math.min(rows.length, maxResults); i++) {
        const row = rows[i];
        const nameEl = row.querySelector('a[class*="name"], td:nth-child(2), [class*="athlete-name"]');
        const bibEl = row.querySelector('[class*="bib"], td:nth-child(1)');
        const timeEl = row.querySelector('[class*="time"], [class*="finish"], td:last-child');
        const placeEl = row.querySelector('[class*="place"], [class*="overall"], td:nth-child(3)');
        const agEl = row.querySelector('[class*="age-group"], [class*="division"]');
        const agPlaceEl = row.querySelector('[class*="ag-place"], [class*="division-place"]');

        res.push({
          runner_name: nameEl ? nameEl.innerText.trim() : "",
          bib_number: bibEl ? bibEl.innerText.trim() : "",
          finish_time: timeEl ? timeEl.innerText.trim() : "",
          overall_place: placeEl ? placeEl.innerText.trim() : "",
          age_group: agEl ? agEl.innerText.trim() : "",
          age_group_place: agPlaceEl ? agPlaceEl.innerText.trim() : "",
        });
      }
      return res;
    }, CFG.maxResults);

    recorder.record("extract", {
      instruction: "Extract race results",
      description: `Extracted ${results.length} results`,
      results: results,
    });

    console.log("\n" + "=".repeat(60));
    console.log(`Athlinks: ${CFG.raceName}`);
    console.log("=".repeat(60));
    results.forEach((r, i) => {
      console.log(`\n  ${i + 1}. ${r.runner_name}`);
      console.log(`     Bib: ${r.bib_number}`);
      console.log(`     Time: ${r.finish_time}`);
      console.log(`     Overall: ${r.overall_place}`);
      if (r.age_group) console.log(`     Age Group: ${r.age_group} (Place: ${r.age_group_place})`);
    });

    // ── Save ───────────────────────────────────────────────────────────
    const outDir = path.join(__dirname);
    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(outDir, "athlinks_search.py"), pyCode);
    console.log("\n✅ Saved athlinks_search.py");

    fs.writeFileSync(
      path.join(outDir, "recorded_actions.json"),
      JSON.stringify(recorder.actions, null, 2)
    );
    console.log("✅ Saved recorded_actions.json");
  } catch (err) {
    console.error("❌ Error:", err);
  } finally {
    await stagehand.close();
  }
})();
