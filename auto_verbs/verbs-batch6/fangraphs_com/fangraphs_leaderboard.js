const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  maxResults: 5,
  waits: { page: 5000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
FanGraphs – MLB WAR Leaderboard

Generated on: ${ts}
Recorded ${n} browser interactions
"""

import re
import os, sys, shutil
from dataclasses import dataclass, field
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class LeaderboardRequest:
    max_results: int = ${cfg.maxResults}


@dataclass
class Player:
    name: str = ""
    team: str = ""
    war: str = ""
    avg: str = ""
    hr: str = ""
    rbi: str = ""


@dataclass
class LeaderboardResult:
    players: list = field(default_factory=list)


def fangraphs_leaderboard(page: Page, request: LeaderboardRequest) -> LeaderboardResult:
    """Get top WAR leaders from FanGraphs."""
    print(f"  Top {request.max_results} by WAR\\n")

    url = "https://www.fangraphs.com/leaders/major-league?pos=all&stats=bat&lg=all&type=8&sortcol=21&sortdir=desc"
    print(f"Loading {url}...")
    checkpoint("Navigate to FanGraphs leaderboard")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    checkpoint("Extract player stats")
    items_data = page.evaluate(r"""(maxResults) => {
        const results = [];
        const rows = document.querySelectorAll(
            'table tbody tr, [class*="table"] tbody tr'
        );
        for (const row of rows) {
            if (results.length >= maxResults) break;
            const cells = row.querySelectorAll('td');
            if (cells.length < 5) continue;

            const nameEl = row.querySelector('a[href*="/players/"]');
            const name = nameEl ? nameEl.innerText.trim() : cells[0]?.innerText?.trim() || '';
            if (!name || name.length < 2) continue;

            const cellTexts = Array.from(cells).map(c => c.innerText.trim());
            let team = '', war = '', avg = '', hr = '', rbi = '';

            // FanGraphs columns vary; try to identify by patterns
            for (const ct of cellTexts) {
                if (!team && /^[A-Z]{2,3}$/.test(ct)) team = ct;
                if (!avg && /^0?\\.\\d{3}$/.test(ct)) avg = ct;
            }

            // WAR is usually the last column on the WAR leaderboard
            const lastCell = cellTexts[cellTexts.length - 1];
            if (/^-?\\d+\\.\\d+$/.test(lastCell)) war = lastCell;

            // HR and RBI are integer columns
            for (let i = 2; i < cellTexts.length; i++) {
                if (/^\\d{1,3}$/.test(cellTexts[i])) {
                    if (!hr) hr = cellTexts[i];
                    else if (!rbi) rbi = cellTexts[i];
                }
            }

            results.push({ name, team, war, avg, hr, rbi });
        }
        return results;
    }""", request.max_results)

    result = LeaderboardResult(players=[Player(**p) for p in items_data])

    print("\\n" + "=" * 60)
    print("FanGraphs: Top WAR Leaders")
    print("=" * 60)
    for p in result.players:
        print(f"  {p.name} ({p.team})")
        print(f"    WAR: {p.war}  AVG: {p.avg}  HR: {p.hr}  RBI: {p.rbi}")
    print(f"\\n  Total: {len(result.players)} players")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("fangraphs_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = fangraphs_leaderboard(page, LeaderboardRequest())
            print(f"\\nReturned {len(result.players)} players")
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
    const url = "https://www.fangraphs.com/leaders/major-league?pos=all&stats=bat&lg=all&type=8&sortcol=21&sortdir=desc";
    console.log(`\n🌐 Loading: ${url}...`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url, description: "Navigate to FanGraphs leaderboard" });

    const players = await stagehand.extract(
      "extract the top 5 players by WAR with player name, team, WAR, batting average, home runs, and RBIs"
    );
    console.log("\n📊 Players:", JSON.stringify(players, null, 2));
    recorder.record("extract", { instruction: "Extract WAR leaders", results: players });

    const dir = path.join(__dirname);
    fs.writeFileSync(path.join(dir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    console.log(`\n💾 Saved ${recorder.actions.length} actions`);

    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(dir, "fangraphs_leaderboard.py"), pyCode);
    console.log("🐍 Saved Python script");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
