const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  player: "LeBron James",
  waits: { page: 5000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Basketball Reference – Player Stats
Player: "${cfg.player}"

Generated on: ${ts}
Recorded ${n} browser interactions
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
class PlayerRequest:
    player: str = "${cfg.player}"


@dataclass
class PlayerStats:
    player_name: str = ""
    ppg: str = ""
    rpg: str = ""
    apg: str = ""
    games_played: str = ""
    career_points: str = ""


def basketball_ref_search(page: Page, request: PlayerRequest) -> PlayerStats:
    """Search Basketball Reference for player stats."""
    print(f"  Player: {request.player}\\n")

    url = f"https://www.basketball-reference.com/search/search.fcgi?search={quote_plus(request.player)}"
    print(f"Loading {url}...")
    checkpoint("Navigate to Basketball Reference search")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    # May auto-redirect to player page
    current_url = page.url
    if "/search/" in current_url:
        try:
            first_link = page.locator('.search-item-name a, .search-results a').first
            if first_link.is_visible(timeout=3000):
                first_link.click()
                page.wait_for_timeout(5000)
        except Exception:
            pass

    checkpoint("Extract career stats")
    body_text = page.evaluate("document.body.innerText") or ""

    player_name = request.player
    ppg = ""
    rpg = ""
    apg = ""
    games_played = ""
    career_points = ""

    try:
        h1 = page.locator("h1").first
        if h1.is_visible(timeout=2000):
            player_name = h1.inner_text().strip()
    except Exception:
        pass

    # PPG
    pm = re.search(r"(\\d+\\.\\d)\\s*(?:PPG|PTS|pts)", body_text, re.IGNORECASE)
    if pm:
        ppg = pm.group(1)

    # RPG
    rm = re.search(r"(\\d+\\.\\d)\\s*(?:RPG|TRB|reb)", body_text, re.IGNORECASE)
    if rm:
        rpg = rm.group(1)

    # APG
    am = re.search(r"(\\d+\\.\\d)\\s*(?:APG|AST|ast)", body_text, re.IGNORECASE)
    if am:
        apg = am.group(1)

    # Games
    gm = re.search(r"(\\d{3,4})\\s*(?:G\\b|Games?)", body_text, re.IGNORECASE)
    if gm:
        games_played = gm.group(1)

    # Career points
    cpm = re.search(r"(?:Career|Total).*?(\\d[\\d,]+)\\s+(?:PTS|points)", body_text, re.IGNORECASE | re.DOTALL)
    if cpm:
        career_points = cpm.group(1)

    result = PlayerStats(
        player_name=player_name,
        ppg=ppg,
        rpg=rpg,
        apg=apg,
        games_played=games_played,
        career_points=career_points,
    )

    print("\\n" + "=" * 60)
    print(f"Basketball Reference: {result.player_name}")
    print("=" * 60)
    print(f"  PPG:           {result.ppg}")
    print(f"  RPG:           {result.rpg}")
    print(f"  APG:           {result.apg}")
    print(f"  Games Played:  {result.games_played}")
    print(f"  Career Points: {result.career_points}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("basketball_ref")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = basketball_ref_search(page, PlayerRequest())
            print(f"\\nReturned stats for {result.player_name}")
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
    const url = `https://www.basketball-reference.com/search/search.fcgi?search=${encodeURIComponent(CFG.player)}`;
    console.log(`\n🌐 Searching: ${url}...`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url, description: "Search player" });

    if (page.url().includes("/search/")) {
      try {
        await stagehand.act("click the first player result link");
        await page.waitForTimeout(CFG.waits.page);
        recorder.record("click", { description: "Click first player result" });
      } catch (e) {
        console.log("   May have auto-redirected");
      }
    }

    const statsData = await stagehand.extract(
      "extract career stats: points per game, rebounds per game, assists per game, games played, and career total points"
    );
    console.log("\n📊 Stats:", JSON.stringify(statsData, null, 2));
    recorder.record("extract", { instruction: "Extract career stats", results: statsData });

    const dir = path.join(__dirname);
    fs.writeFileSync(path.join(dir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    console.log(`\n💾 Saved ${recorder.actions.length} actions`);

    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(dir, "basketball_ref_stats.py"), pyCode);
    console.log("🐍 Saved Python script");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
