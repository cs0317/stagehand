const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * NFL – Team Schedule (via ESPN)
 *
 * Note: NFL.com schedule page is unavailable during offseason.
 * Uses ESPN's team schedule page as data source.
 * Extracts most recent games with opponent, date, and score.
 */

const CFG = {
  url: "https://www.espn.com/nfl/team/schedule/_/name/sea/seattle-seahawks",
  team: "Seattle Seahawks",
  teamSlug: "sea",
  maxGames: 5,
  waits: { page: 8000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  const lines = [];
  lines.push('"""');
  lines.push("Auto-generated Playwright script (Python)");
  lines.push("NFL - Team Schedule (via ESPN)");
  lines.push("Team: " + cfg.team);
  lines.push("");
  lines.push("Note: NFL.com schedule page is unavailable during offseason.");
  lines.push("Uses ESPN schedule page as data source.");
  lines.push("");
  lines.push("Generated on: " + ts);
  lines.push("Recorded " + n + " browser interactions");
  lines.push('"""');
  lines.push("");
  lines.push("import re");
  lines.push("import os, sys, shutil");
  lines.push("from playwright.sync_api import Playwright, sync_playwright");
  lines.push("");
  lines.push('sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))');
  lines.push("from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws");
  lines.push("");
  lines.push("");
  lines.push("RESULT_RE = re.compile(r'^([WLT])(\\d+-\\d+(?:\\s+OT)?)\\s+(\\d+-\\d+(?:-\\d+)?)')");
  lines.push("WEEK_DATE_RE = re.compile(r'^(\\d+|DIV|CONF|SB|WC)\\s+(.+)$')");
  lines.push("");
  lines.push("");
  lines.push("def run(");
  lines.push("    playwright: Playwright,");
  lines.push('    team_slug: str = "' + cfg.teamSlug + '",');
  lines.push('    team: str = "' + cfg.team + '",');
  lines.push("    max_games: int = " + cfg.maxGames + ",");
  lines.push(") -> list:");
  lines.push('    print(f"  Team: {team}\\n")');
  lines.push("");
  lines.push("    port = get_free_port()");
  lines.push('    profile_dir = get_temp_profile_dir("nfl_com")');
  lines.push("    chrome_proc = launch_chrome(profile_dir, port)");
  lines.push("    ws_url = wait_for_cdp_ws(port)");
  lines.push("    browser = playwright.chromium.connect_over_cdp(ws_url)");
  lines.push("    context = browser.contexts[0]");
  lines.push("    page = context.pages[0] if context.pages else context.new_page()");
  lines.push("    all_games = []");
  lines.push("");
  lines.push("    try:");
  lines.push('        url = f"https://www.espn.com/nfl/team/schedule/_/name/{team_slug}"');
  lines.push('        print(f"Loading {url}...")');
  lines.push('        page.goto(url, wait_until="domcontentloaded")');
  lines.push("        page.wait_for_timeout(8000)");
  lines.push('        print(f"  Loaded: {page.url}")');
  lines.push("");
  lines.push("        text = page.evaluate(\"document.body ? document.body.innerText : ''\") or \"\"");
  lines.push('        text_lines = [l.strip() for l in text.split("\\n") if l.strip()]');
  lines.push("");
  lines.push("        # Parse game entries");
  lines.push("        # Pattern: week+date line -> 'vs'/'@' -> opponent -> result line");
  lines.push("        i = 0");
  lines.push("        in_schedule = False");
  lines.push("        while i < len(text_lines):");
  lines.push("            line = text_lines[i]");
  lines.push("");
  lines.push("            if line in ('Postseason', 'Regular Season'):");
  lines.push("                in_schedule = True");
  lines.push("                i += 2  # skip header row");
  lines.push("                continue");
  lines.push("            if line == 'Preseason':");
  lines.push("                break");
  lines.push("");
  lines.push("            if in_schedule:");
  lines.push("                m = WEEK_DATE_RE.match(line)");
  lines.push("                if m and line != 'BYE WEEK' and not line.startswith('WK'):");
  lines.push("                    parts = m.group(0).split(None, 1)");
  lines.push("                    week = parts[0]");
  lines.push("                    date = parts[1] if len(parts) > 1 else ''");
  lines.push("                    # Handle multi-word week (e.g., '8  BYE WEEK')");
  lines.push("                    if 'BYE' in date:");
  lines.push("                        i += 1");
  lines.push("                        continue");
  lines.push("                    home_away = text_lines[i + 1] if i + 1 < len(text_lines) else ''");
  lines.push("                    opponent = text_lines[i + 2] if i + 2 < len(text_lines) else ''");
  lines.push("                    result_line = text_lines[i + 3] if i + 3 < len(text_lines) else ''");
  lines.push("                    rm = RESULT_RE.match(result_line)");
  lines.push("                    if rm:");
  lines.push("                        wl = rm.group(1)");
  lines.push("                        score = rm.group(2)");
  lines.push("                        record = rm.group(3)");
  lines.push("                        prefix = 'vs' if home_away == 'vs' else '@'");
  lines.push("                        all_games.append({");
  lines.push("                            'week': week,");
  lines.push("                            'date': date,");
  lines.push("                            'opponent': f'{prefix} {opponent}',");
  lines.push("                            'result': f'{wl} {score}',");
  lines.push("                            'record': record,");
  lines.push("                        })");
  lines.push("                        i += 4");
  lines.push("                        continue");
  lines.push("");
  lines.push("            i += 1");
  lines.push("");
  lines.push("        # Take last N games (most recent)");
  lines.push("        results = all_games[-max_games:]");
  lines.push("");
  lines.push('        print("=" * 60)');
  lines.push('        print(f"{team} - Recent Games")');
  lines.push('        print("=" * 60)');
  lines.push("        for idx, g in enumerate(results, 1):");
  lines.push("            print(f\"\\n{idx}. Week {g['week']}: {g['date']}\")");
  lines.push("            print(f\"   Opponent: {g['opponent']}\")");
  lines.push("            print(f\"   Result:   {g['result']}\")");
  lines.push("            print(f\"   Record:   {g['record']}\")");
  lines.push("");
  lines.push('        print(f"\\nShowing {len(results)} most recent games")');
  lines.push("");
  lines.push("    except Exception as e:");
  lines.push('        print(f"Error: {e}")');
  lines.push("        import traceback");
  lines.push("        traceback.print_exc()");
  lines.push("    finally:");
  lines.push("        browser.close()");
  lines.push("        chrome_proc.terminate()");
  lines.push("        shutil.rmtree(profile_dir, ignore_errors=True)");
  lines.push("");
  lines.push("    return results");
  lines.push("");
  lines.push("");
  lines.push('if __name__ == "__main__":');
  lines.push("    with sync_playwright() as pw:");
  lines.push("        run(pw)");
  return lines.join("\n");
}

// ── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  const llmClient = setupLLMClient("hybrid");
  const stagehand = new Stagehand({ env: "LOCAL", verbose: 0, llmClient });
  await stagehand.init();
  const page = stagehand.context.pages()[0];
  const recorder = new PlaywrightRecorder();

  try {
    console.log("Loading " + CFG.url);
    recorder.record("page.goto", { url: CFG.url });
    await page.goto(CFG.url, { waitUntil: "domcontentloaded" });
    await new Promise(r => setTimeout(r, CFG.waits.page));
    console.log("  URL:", page.url());

    const text = await page.evaluate(() => document.body ? document.body.innerText : "");
    const tLines = text.split("\n").map(l => l.trim()).filter(Boolean);

    const RESULT_RE = /^([WLT])(\d+-\d+(?:\s+OT)?)\s+(\d+-\d+(?:-\d+)?)/;
    const WEEK_DATE_RE = /^(\d+|DIV|CONF|SB|WC)\s+(.+)$/;
    const postGames = [];
    const regGames = [];
    let inSchedule = false;
    let currentSection = "";

    for (let i = 0; i < tLines.length; ) {
      const line = tLines[i];

      if (line === "Postseason" || line === "Regular Season") {
        inSchedule = true;
        currentSection = line;
        i += 2; // skip header
        continue;
      }
      if (line === "Preseason") break;

      if (inSchedule) {
        const m = line.match(WEEK_DATE_RE);
        if (m && !line.includes("BYE WEEK") && !line.startsWith("WK")) {
          const parts = line.split(/\s+/);
          const week = parts[0];
          const date = line.substring(week.length).trim();

          if (date.includes("BYE")) { i++; continue; }

          const homeAway = (i + 1 < tLines.length) ? tLines[i + 1] : "";
          const opponent = (i + 2 < tLines.length) ? tLines[i + 2] : "";
          const resultLine = (i + 3 < tLines.length) ? tLines[i + 3] : "";
          const rm = resultLine.match(RESULT_RE);

          if (rm) {
            const game = {
              week, date,
              opponent: (homeAway === "vs" ? "vs " : "@ ") + opponent,
              result: rm[1] + " " + rm[2],
              record: rm[3],
            };
            if (currentSection === "Postseason") {
              postGames.push(game);
            } else {
              regGames.push(game);
            }
            i += 4;
            continue;
          }
        }
      }
      i++;
    }

    // Chronological order: regular season then postseason
    const allGames = [...regGames, ...postGames];

    // Show last N games (most recent)
    const results = allGames.slice(-CFG.maxGames);

    console.log("\n" + "=".repeat(60));
    console.log(CFG.team + " - Recent Games");
    console.log("=".repeat(60));
    for (let idx = 0; idx < results.length; idx++) {
      const g = results[idx];
      console.log("\n" + (idx + 1) + ". Week " + g.week + ": " + g.date);
      console.log("   Opponent: " + g.opponent);
      console.log("   Result:   " + g.result);
      console.log("   Record:   " + g.record);
    }
    console.log("\nShowing " + results.length + " most recent games");

    // Generate Python
    const pyCode = genPython(CFG, recorder);
    const pyPath = path.join(__dirname, "nfl_schedule.py");
    fs.writeFileSync(pyPath, pyCode);
    console.log("Python script written to:", pyPath);

  } catch(e) {
    console.error("Error:", e.message);
  } finally {
    await stagehand.close();
  }
})();
