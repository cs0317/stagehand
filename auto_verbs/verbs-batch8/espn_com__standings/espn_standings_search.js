const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * ESPN – Get current league standings
 */

const CFG = {
  sport: "nba",
  maxResults: 15,
  waits: { page: 5000, action: 2000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
ESPN – Get current league standings

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
class EspnStandingsSearchRequest:
    sport: str = "${cfg.sport}"
    max_results: int = ${cfg.maxResults}


@dataclass
class EspnStandingsItem:
    team_name: str = ""
    wins: str = ""
    losses: str = ""
    ties: str = ""
    win_percentage: str = ""
    games_behind: str = ""
    division: str = ""
    conference: str = ""


@dataclass
class EspnStandingsSearchResult:
    items: List[EspnStandingsItem] = field(default_factory=list)


# Get current league standings from ESPN.
def espn_standings_search(page: Page, request: EspnStandingsSearchRequest) -> EspnStandingsSearchResult:
    """Get current league standings from ESPN."""
    print(f"  Sport: {request.sport}\\n")

    url = f"https://www.espn.com/{request.sport}/standings"
    print(f"Loading {url}...")
    checkpoint("Navigate to ESPN standings page")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    result = EspnStandingsSearchResult()

    checkpoint("Extract standings table")
    js_code = """(max) => {
        const rows = document.querySelectorAll('table tbody tr, [class*="standings"] tr, [class*="Table"] tbody tr');
        const items = [];
        let currentDivision = '';
        let currentConference = '';
        for (const row of rows) {
            if (items.length >= max) break;
            const headerEl = row.querySelector('td[class*="group"], th, [class*="header"]');
            if (headerEl && row.querySelectorAll('td').length <= 2) {
                const text = headerEl.textContent.trim();
                if (text.toLowerCase().includes('east') || text.toLowerCase().includes('west') ||
                    text.toLowerCase().includes('afc') || text.toLowerCase().includes('nfc') ||
                    text.toLowerCase().includes('american') || text.toLowerCase().includes('national')) {
                    currentConference = text;
                } else {
                    currentDivision = text;
                }
                continue;
            }
            const cells = row.querySelectorAll('td, th');
            if (cells.length < 3) continue;
            const teamEl = row.querySelector('[class*="team"], [class*="Team"], a[class*="name"], .hide-mobile a, td:first-child a');
            const team_name = teamEl ? teamEl.textContent.trim() : (cells[0] ? cells[0].textContent.trim() : '');
            if (!team_name || team_name.length < 2) continue;

            const vals = Array.from(cells).map(c => c.textContent.trim());
            const wins = vals[1] || '';
            const losses = vals[2] || '';
            const ties = vals[3] || '';
            const win_percentage = vals.find(v => v.match(/^\\.\d{3}$/) || v.match(/^0\\.\d+$/)) || '';
            const games_behind = vals.find(v => v.match(/^-$/) || v.match(/^\\d+(\\.\\d)?$/)) || '';

            items.push({team_name, wins, losses, ties, win_percentage, games_behind, division: currentDivision, conference: currentConference});
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = EspnStandingsItem()
        item.team_name = d.get("team_name", "")
        item.wins = d.get("wins", "")
        item.losses = d.get("losses", "")
        item.ties = d.get("ties", "")
        item.win_percentage = d.get("win_percentage", "")
        item.games_behind = d.get("games_behind", "")
        item.division = d.get("division", "")
        item.conference = d.get("conference", "")
        result.items.append(item)

    for i, item in enumerate(result.items, 1):
        print(f"\\n  Team {i}:")
        print(f"    Name:       {item.team_name}")
        print(f"    W-L-T:      {item.wins}-{item.losses}-{item.ties}")
        print(f"    Win%:       {item.win_percentage}")
        print(f"    GB:         {item.games_behind}")
        print(f"    Division:   {item.division}")
        print(f"    Conference: {item.conference}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("espn_standings")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            request = EspnStandingsSearchRequest()
            result = espn_standings_search(page, request)
            print("\\n=== DONE ===")
            print(f"Found {len(result.items)} teams")
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
    const url = `https://www.espn.com/${CFG.sport}/standings`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    recorder.record("navigate", url, `Navigate to ${url}`);
    await page.waitForTimeout(CFG.waits.page);

    const data = await stagehand.extract(
      `Extract the first ${CFG.maxResults} teams from the standings table. For each get the team name, wins, losses, ties, win percentage, games behind, division, and conference.`
    );
    recorder.record("extract", "standings table", JSON.stringify(data));
    console.log("Extracted:", JSON.stringify(data, null, 2));

    const outDir = __dirname;
    fs.writeFileSync(path.join(outDir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    fs.writeFileSync(path.join(outDir, "espn_standings_search.py"), genPython(CFG, recorder));
    console.log("Saved espn_standings_search.py");
  } finally {
    await stagehand.close();
  }
})();
