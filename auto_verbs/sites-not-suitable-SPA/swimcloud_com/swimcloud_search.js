const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * SwimCloud – Search for swim meet results by keyword
 */

const CFG = {
  searchQuery: "100 freestyle",
  maxResults: 5,
  waits: { page: 5000, action: 2000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
SwimCloud – Search for swim meet results by keyword

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
class SwimcloudSearchRequest:
    search_query: str = "${cfg.searchQuery}"
    max_results: int = ${cfg.maxResults}


@dataclass
class SwimcloudResultItem:
    swimmer_name: str = ""
    team: str = ""
    event: str = ""
    time: str = ""
    meet_name: str = ""
    date: str = ""


@dataclass
class SwimcloudSearchResult:
    items: List[SwimcloudResultItem] = field(default_factory=list)


# Search for swim meet results on SwimCloud by keyword.
def swimcloud_search(page: Page, request: SwimcloudSearchRequest) -> SwimcloudSearchResult:
    """Search for swim meet results on SwimCloud."""
    print(f"  Query: {request.search_query}\\n")

    query = request.search_query.replace(" ", "+")
    url = f"https://www.swimcloud.com/results/?query={query}"
    print(f"Loading {url}...")
    checkpoint("Navigate to SwimCloud search results")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    result = SwimcloudSearchResult()

    checkpoint("Extract swim result listings")
    js_code = """(max) => {
        const rows = document.querySelectorAll('tr, [class*="Result"], [class*="result"], [class*="Card"], article');
        const items = [];
        for (const row of rows) {
            if (items.length >= max) break;
            const nameEl = row.querySelector('[class*="name"], [class*="swimmer"], h3, h2, a');
            const teamEl = row.querySelector('[class*="team"], [class*="club"], [class*="organization"]');
            const eventEl = row.querySelector('[class*="event"], [class*="stroke"], [class*="distance"]');
            const timeEl = row.querySelector('[class*="time"], [class*="result"], [class*="performance"]');
            const meetEl = row.querySelector('[class*="meet"], [class*="competition"]');
            const dateEl = row.querySelector('time, [class*="date"]');

            const swimmer_name = nameEl ? nameEl.textContent.trim() : '';
            const team = teamEl ? teamEl.textContent.trim() : '';
            const event = eventEl ? eventEl.textContent.trim() : '';
            const time = timeEl ? timeEl.textContent.trim() : '';
            const meet_name = meetEl ? meetEl.textContent.trim() : '';
            const date = dateEl ? (dateEl.getAttribute('datetime') || dateEl.textContent.trim()) : '';

            if (swimmer_name) {
                items.push({swimmer_name, team, event, time, meet_name, date});
            }
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = SwimcloudResultItem()
        item.swimmer_name = d.get("swimmer_name", "")
        item.team = d.get("team", "")
        item.event = d.get("event", "")
        item.time = d.get("time", "")
        item.meet_name = d.get("meet_name", "")
        item.date = d.get("date", "")
        result.items.append(item)

    for i, item in enumerate(result.items, 1):
        print(f"\\n  Result {i}:")
        print(f"    Swimmer: {item.swimmer_name}")
        print(f"    Team:    {item.team}")
        print(f"    Event:   {item.event}")
        print(f"    Time:    {item.time}")
        print(f"    Meet:    {item.meet_name}")
        print(f"    Date:    {item.date}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("swimcloud")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            request = SwimcloudSearchRequest()
            result = swimcloud_search(page, request)
            print("\\n=== DONE ===")
            print(f"Found {len(result.items)} results")
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
    const query = CFG.searchQuery.replace(/ /g, "+");
    const url = `https://www.swimcloud.com/results/?query=${query}`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    recorder.record("navigate", url, `Navigate to ${url}`);
    await page.waitForTimeout(CFG.waits.page);

    const data = await stagehand.extract(
      `Extract the first ${CFG.maxResults} swim results. For each get the swimmer name, team, event, time, meet name, and date.`
    );
    recorder.record("extract", "swim results", JSON.stringify(data));
    console.log("Extracted:", JSON.stringify(data, null, 2));

    const outDir = __dirname;
    fs.writeFileSync(path.join(outDir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    fs.writeFileSync(path.join(outDir, "swimcloud_search.py"), genPython(CFG, recorder));
    console.log("Saved swimcloud_search.py");
  } finally {
    await stagehand.close();
  }
})();
