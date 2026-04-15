const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient, observeAndAct } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");
const os = require("os");

/**
 * ESPN.com – NBA Standings
 *
 * Uses AI-driven discovery to navigate to the NBA standings page,
 * then generates a pure-Playwright Python script.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  url: "https://www.espn.com",
  league: "NBA",
  maxResults: 5,
  waits: { page: 3000, nav: 2000, load: 5000 },
};

// ── Python Script Generator ──────────────────────────────────────────────────
function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
ESPN.com – ${cfg.league} Standings

Generated on: ${ts}
Recorded ${n} browser interactions

Uses Playwright via CDP connection with the user's Chrome profile.
"""

import re
import os, sys, shutil
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws


def run(
    playwright: Playwright,
    league: str = "${cfg.league}",
    max_results: int = ${cfg.maxResults},
) -> list:
    print(f"  League: {league}")
    print(f"  Max results: {max_results}\\n")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("espn_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        # ── Navigate to standings ─────────────────────────────────────────
        print(f"Loading ESPN {league} standings...")
        page.goto(f"${cfg.url}/{league.lower()}/standings")
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(3000)

        # ── Dismiss popups ────────────────────────────────────────────────
        for selector in [
            "button#onetrust-accept-btn-handler",
            "button:has-text('Accept')",
            "button:has-text('No, thanks')",
            "button:has-text('Close')",
        ]:
            try:
                btn = page.locator(selector).first
                if btn.is_visible(timeout=1500):
                    btn.evaluate("el => el.click()")
                    page.wait_for_timeout(500)
            except Exception:
                pass

        # ── STEP 1: Extract standings ─────────────────────────────────────
        print(f"STEP 1: Extract top {max_results} teams...")

        rows = page.locator(
            'table tbody tr, '
            'div[class*="standings"] tr, '
            '[data-testid="standings-row"]'
        )
        count = rows.count()
        print(f"  Found {count} rows")

        for i in range(min(count, max_results)):
            row = rows.nth(i)
            try:
                team_name = "N/A"
                wins = "N/A"
                losses = "N/A"

                cells = row.locator("td")
                cell_count = cells.count()

                # Team name: typically first cell with a link
                try:
                    name_el = row.locator(
                        'a[class*="team"], '
                        'span[class*="team-name"], '
                        'td:first-child a'
                    ).first
                    team_name = name_el.inner_text(timeout=2000).strip()
                except Exception:
                    if cell_count > 0:
                        team_name = cells.nth(0).inner_text(timeout=2000).strip()

                # Wins and losses: typically second and third columns
                if cell_count >= 3:
                    try:
                        wins = cells.nth(1).inner_text(timeout=2000).strip()
                        losses = cells.nth(2).inner_text(timeout=2000).strip()
                    except Exception:
                        pass

                if team_name != "N/A":
                    results.append({
                        "team_name": team_name,
                        "wins": wins,
                        "losses": losses,
                    })
                    print(f"  {len(results)}. {team_name} | W: {wins} | L: {losses}")

            except Exception as e:
                print(f"  Error on row {i}: {e}")
                continue

        # ── Print results ─────────────────────────────────────────────────
        print(f"\\nTop {len(results)} {league} teams:")
        for i, r in enumerate(results, 1):
            print(f"  {i}. {r['team_name']}")
            print(f"     Wins: {r['wins']}  Losses: {r['losses']}")

    except Exception as e:
        import traceback
        print(f"Error: {e}")
        traceback.print_exc()
    finally:
        try:
            browser.close()
        except Exception:
            pass
        chrome_proc.terminate()
        shutil.rmtree(profile_dir, ignore_errors=True)

    return results


if __name__ == "__main__":
    with sync_playwright() as playwright:
        items = run(playwright)
        print(f"\\nTotal teams found: {len(items)}")
`;
}

// ── Step Functions ───────────────────────────────────────────────────────────

async function dismissPopups(page) {
  for (const sel of [
    "button#onetrust-accept-btn-handler",
    "button:has-text('Accept')",
    "button:has-text('No, thanks')",
    "button:has-text('Close')",
  ]) {
    try {
      const btn = page.locator(sel);
      if (await btn.isVisible({ timeout: 1500 })) {
        await btn.click();
      }
    } catch (e) { /* no popup */ }
  }
  await page.waitForTimeout(500);
}

async function extractStandings(stagehand, page, recorder) {
  console.log(`🎯 Extract top ${CFG.maxResults} ${CFG.league} teams...\n`);
  const { z } = require("zod/v3");

  const listings = await stagehand.extract(
    `Extract the top ${CFG.maxResults} teams from the ${CFG.league} standings table. For each team get the team name, number of wins, and number of losses.`,
    z.object({
      teams: z.array(z.object({
        teamName: z.string().describe("Team name"),
        wins: z.string().describe("Number of wins"),
        losses: z.string().describe("Number of losses"),
      })).describe(`Top ${CFG.maxResults} teams`),
    })
  );

  recorder.record("extract", {
    instruction: "Extract standings",
    description: `Extract top ${CFG.maxResults} ${CFG.league} teams`,
    results: listings,
  });

  console.log(`📋 Found ${listings.teams.length} teams:`);
  listings.teams.forEach((r, i) => {
    console.log(`   ${i + 1}. ${r.teamName} — W: ${r.wins}  L: ${r.losses}`);
  });

  return listings;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  ESPN.com – ${CFG.league} Standings`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  const recorder = new PlaywrightRecorder();
  const llmClient = setupLLMClient("hybrid");
  let stagehand;

  try {
    stagehand = new Stagehand({
      env: "LOCAL",
      verbose: 0,
      llmClient,
      localBrowserLaunchOptions: {
        userDataDir: path.join(os.homedir(), "AppData", "Local", "Google", "Chrome", "User Data", "Default"),
        headless: false,
        viewport: { width: 1920, height: 1080 },
        args: ["--disable-blink-features=AutomationControlled", "--disable-infobars", "--disable-extensions", "--start-maximized", "--window-size=1920,1080"],
      },
    });
    await stagehand.init();

    const page = stagehand.context.pages()[0];

    recorder.goto(`${CFG.url}/${CFG.league.toLowerCase()}/standings`);
    await page.goto(`${CFG.url}/${CFG.league.toLowerCase()}/standings`);
    await page.waitForLoadState("domcontentloaded");
    recorder.wait(CFG.waits.page, "Initial page load");
    await page.waitForTimeout(CFG.waits.page);

    await dismissPopups(page);
    const listings = await extractStandings(stagehand, page, recorder);

    // Save Python + JSON
    const pyScript = genPython(CFG, recorder);
    fs.writeFileSync(path.join(__dirname, "espn_standings.py"), pyScript, "utf-8");
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2), "utf-8");
    console.log("✅ Files saved");

    return listings;

  } catch (err) {
    console.error("❌ Error:", err.message);
    if (recorder?.actions.length > 0) {
      fs.writeFileSync(path.join(__dirname, "espn_standings.py"), genPython(CFG, recorder), "utf-8");
    }
    throw err;
  } finally {
    if (stagehand) await stagehand.close();
  }
}

if (require.main === module) {
  main().then(() => { console.log("🎊 Done!"); process.exit(0); }).catch((e) => { console.error("💥", e.message); process.exit(1); });
}
module.exports = { main };
