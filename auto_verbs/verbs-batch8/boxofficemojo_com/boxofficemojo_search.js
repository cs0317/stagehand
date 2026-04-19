const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Box Office Mojo – Browse current weekend box office rankings
 */

const CFG = {
  maxResults: 10,
  waits: { page: 5000, action: 2000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Box Office Mojo – Browse current weekend box office rankings

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
class BoxOfficeMojoSearchRequest:
    max_results: int = ${cfg.maxResults}


@dataclass
class BoxOfficeMovieItem:
    rank: str = ""
    movie_title: str = ""
    weekend_gross: str = ""
    total_gross: str = ""
    weeks_in_release: str = ""
    distributor: str = ""


@dataclass
class BoxOfficeMojoSearchResult:
    items: List[BoxOfficeMovieItem] = field(default_factory=list)


# Browse the current weekend box office rankings on Box Office Mojo.
def boxofficemojo_search(page: Page, request: BoxOfficeMojoSearchRequest) -> BoxOfficeMojoSearchResult:
    """Browse current weekend box office rankings."""
    print(f"  Max results: {request.max_results}\\n")

    url = "https://www.boxofficemojo.com/weekend/chart/"
    print(f"Loading {url}...")
    checkpoint("Navigate to Box Office Mojo weekend chart")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    result = BoxOfficeMojoSearchResult()

    checkpoint("Extract box office rankings")
    js_code = """(max) => {
        const rows = document.querySelectorAll('#table table tr, table[class*="mojo"] tr, div[id*="table"] tr');
        const items = [];
        for (const row of rows) {
            if (items.length >= max) break;
            const cells = row.querySelectorAll('td');
            if (cells.length < 4) continue;

            const rankText = cells[0] ? cells[0].textContent.trim() : '';
            const titleEl = row.querySelector('td a[href*="/release/"], td a[href*="/title/"]');
            const title = titleEl ? titleEl.textContent.trim() : '';

            if (!title || !rankText.match(/^\\\\d+$/)) continue;

            const weekendGross = cells.length > 2 ? cells[2].textContent.trim() : '';
            const totalGross = cells.length > 6 ? cells[6].textContent.trim() : '';
            const weeks = cells.length > 7 ? cells[7].textContent.trim() : '';
            const distributor = cells.length > 8 ? cells[8].textContent.trim() : '';

            items.push({
                rank: rankText,
                movie_title: title,
                weekend_gross: weekendGross,
                total_gross: totalGross,
                weeks_in_release: weeks,
                distributor: distributor
            });
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = BoxOfficeMovieItem()
        item.rank = d.get("rank", "")
        item.movie_title = d.get("movie_title", "")
        item.weekend_gross = d.get("weekend_gross", "")
        item.total_gross = d.get("total_gross", "")
        item.weeks_in_release = d.get("weeks_in_release", "")
        item.distributor = d.get("distributor", "")
        result.items.append(item)

    for i, item in enumerate(result.items, 1):
        print(f"\\n  Movie {i}:")
        print(f"    Rank:          {item.rank}")
        print(f"    Title:         {item.movie_title}")
        print(f"    Weekend Gross: {item.weekend_gross}")
        print(f"    Total Gross:   {item.total_gross}")
        print(f"    Weeks:         {item.weeks_in_release}")
        print(f"    Distributor:   {item.distributor}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("boxofficemojo")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            request = BoxOfficeMojoSearchRequest()
            result = boxofficemojo_search(page, request)
            print("\\n=== DONE ===")
            print(f"Found {len(result.items)} movies")
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
    const url = "https://www.boxofficemojo.com/weekend/chart/";
    await page.goto(url, { waitUntil: "domcontentloaded" });
    recorder.record("navigate", url, `Navigate to ${url}`);
    await page.waitForTimeout(CFG.waits.page);

    const data = await stagehand.extract(
      `Extract the top ${CFG.maxResults} movies from the weekend box office chart. For each get the rank, movie title, weekend gross, total gross, weeks in release, and distributor.`
    );
    recorder.record("extract", "box office rankings", JSON.stringify(data));
    console.log("Extracted:", JSON.stringify(data, null, 2));

    const outDir = __dirname;
    fs.writeFileSync(path.join(outDir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    fs.writeFileSync(path.join(outDir, "boxofficemojo_search.py"), genPython(CFG, recorder));
    console.log("Saved boxofficemojo_search.py");
  } finally {
    await stagehand.close();
  }
})();
