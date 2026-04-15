const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * NBA – Standings
 *
 * Extracts top teams in the Eastern Conference from NBA standings.
 */

const CFG = {
  url: "https://www.nba.com/standings",
  conference: "Eastern",
  maxTeams: 5,
  waits: { page: 10000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  const lines = [];
  lines.push('"""');
  lines.push("Auto-generated Playwright script (Python)");
  lines.push("NBA - " + cfg.conference + " Conference Standings");
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
  lines.push("STAT_RE = re.compile(r'^(\\d+)\\s+(\\d+)\\s+\\.(\\d+)\\s+(\\S+)')");
  lines.push("");
  lines.push("");
  lines.push("def run(");
  lines.push("    playwright: Playwright,");
  lines.push('    conference: str = "' + cfg.conference + '",');
  lines.push("    max_teams: int = " + cfg.maxTeams + ",");
  lines.push(") -> list:");
  lines.push('    print(f"  {conference} Conference Top {max_teams} Teams\\n")');
  lines.push("");
  lines.push("    port = get_free_port()");
  lines.push('    profile_dir = get_temp_profile_dir("nba_com")');
  lines.push("    chrome_proc = launch_chrome(profile_dir, port)");
  lines.push("    ws_url = wait_for_cdp_ws(port)");
  lines.push("    browser = playwright.chromium.connect_over_cdp(ws_url)");
  lines.push("    context = browser.contexts[0]");
  lines.push("    page = context.pages[0] if context.pages else context.new_page()");
  lines.push("    results = []");
  lines.push("");
  lines.push("    try:");
  lines.push('        url = "' + cfg.url + '"');
  lines.push('        print(f"Loading {url}...")');
  lines.push('        page.goto(url, wait_until="domcontentloaded")');
  lines.push("        page.wait_for_timeout(10000)");
  lines.push('        print(f"  Loaded: {page.url}")');
  lines.push("");
  lines.push("        text = page.evaluate(\"document.body ? document.body.innerText : ''\") or \"\"");
  lines.push('        text_lines = [l.strip() for l in text.split("\\n") if l.strip()]');
  lines.push("");
  lines.push("        # Find the conference section");
  lines.push("        conf_header = conference + ' Conference'");
  lines.push("        i = 0");
  lines.push("        in_conf = False");
  lines.push("        while i < len(text_lines) and len(results) < max_teams:");
  lines.push("            line = text_lines[i]");
  lines.push("");
  lines.push("            if line == conf_header:");
  lines.push("                in_conf = True");
  lines.push("                i += 1");
  lines.push("                continue");
  lines.push("");
  lines.push("            # Stop at next conference");
  lines.push("            if in_conf and 'Conference' in line and line != conf_header and 'TEAM' not in line:");
  lines.push("                break");
  lines.push("");
  lines.push("            if in_conf:");
  lines.push("                # Look for rank number (1-15)");
  lines.push("                if re.match(r'^\\d{1,2}$', line):");
  lines.push("                    rank = int(line)");
  lines.push("                    # Next lines: city, team_name, marker, stats");
  lines.push("                    city = text_lines[i + 1] if i + 1 < len(text_lines) else ''");
  lines.push("                    team = text_lines[i + 2] if i + 2 < len(text_lines) else ''");
  lines.push("                    # Find stats line (starts with digits: W L)");
  lines.push("                    for j in range(i + 3, min(i + 6, len(text_lines))):");
  lines.push("                        m = STAT_RE.match(text_lines[j])");
  lines.push("                        if m:");
  lines.push("                            wins = int(m.group(1))");
  lines.push("                            losses = int(m.group(2))");
  lines.push("                            pct = '.' + m.group(3)");
  lines.push("                            gb = m.group(4)");
  lines.push("                            full_name = city + ' ' + team");
  lines.push("                            results.append({");
  lines.push("                                'rank': rank,");
  lines.push("                                'name': full_name,");
  lines.push("                                'wins': wins,");
  lines.push("                                'losses': losses,");
  lines.push("                                'pct': pct,");
  lines.push("                                'gb': gb,");
  lines.push("                            })");
  lines.push("                            break");
  lines.push("");
  lines.push("            i += 1");
  lines.push("");
  lines.push('        print("=" * 60)');
  lines.push('        print(f"NBA {conference} Conference Standings (Top {max_teams})")');
  lines.push('        print("=" * 60)');
  lines.push("        print(f\"{'Team':<28} {'W':>3} {'L':>3} {'PCT':>5} {'GB':>4}\")");
  lines.push("        print('-' * 48)");
  lines.push("        for r in results:");
  lines.push("            label = str(r['rank']) + '. ' + r['name']");
  lines.push("            print(f\"{label:<28} {r['wins']:>3} {r['losses']:>3} {r['pct']:>5} {r['gb']:>4}\")");
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

    const STAT_RE = /^(\d+)\s+(\d+)\s+\.(\d+)\s+(\S+)/;
    const confHeader = CFG.conference + " Conference";
    const results = [];
    let inConf = false;

    for (let i = 0; i < tLines.length && results.length < CFG.maxTeams; i++) {
      const line = tLines[i];

      if (line === confHeader) {
        inConf = true;
        continue;
      }

      if (inConf && line.includes("Conference") && line !== confHeader && !line.includes("TEAM")) {
        break;
      }

      if (inConf && /^\d{1,2}$/.test(line)) {
        const rank = parseInt(line);
        const city = (i + 1 < tLines.length) ? tLines[i + 1] : "";
        const team = (i + 2 < tLines.length) ? tLines[i + 2] : "";

        for (let j = i + 3; j < Math.min(i + 6, tLines.length); j++) {
          const m = tLines[j].match(STAT_RE);
          if (m) {
            results.push({
              rank,
              name: city + " " + team,
              wins: parseInt(m[1]),
              losses: parseInt(m[2]),
              pct: "." + m[3],
              gb: m[4],
            });
            break;
          }
        }
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log("NBA " + CFG.conference + " Conference Standings (Top " + CFG.maxTeams + ")");
    console.log("=".repeat(60));
    console.log("Team".padEnd(28) + "  W".padStart(3) + "  L".padStart(3) + "  PCT".padStart(5) + "  GB".padStart(4));
    console.log("-".repeat(48));
    for (const r of results) {
      const label = r.rank + ". " + r.name;
      console.log(label.padEnd(28) + String(r.wins).padStart(3) + String(r.losses).padStart(4) + r.pct.padStart(6) + r.gb.padStart(5));
    }

    // Generate Python
    const pyCode = genPython(CFG, recorder);
    const pyPath = path.join(__dirname, "nba_standings.py");
    fs.writeFileSync(pyPath, pyCode);
    console.log("\nPython script written to:", pyPath);

  } catch(e) {
    console.error("Error:", e.message);
  } finally {
    await stagehand.close();
  }
})();
