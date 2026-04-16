const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * MLB – Standings
 *
 * Extracts top teams in the American League from MLB standings page.
 */

const CFG = {
  url: "https://www.mlb.com/standings",
  maxTeams: 5,
  waits: { page: 10000 },
};

// Known MLB AL teams
const AL_TEAMS = new Set([
  "Tampa Bay Rays", "New York Yankees", "Baltimore Orioles", "Toronto Blue Jays", "Boston Red Sox",
  "Minnesota Twins", "Cleveland Guardians", "Detroit Tigers", "Kansas City Royals", "Chicago White Sox",
  "Texas Rangers", "Houston Astros", "Seattle Mariners", "Los Angeles Angels", "Oakland Athletics",
  "Athletics",
]);

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  const lines = [];
  lines.push('"""');
  lines.push("Auto-generated Playwright script (Python)");
  lines.push("MLB - American League Standings");
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
  lines.push("AL_TEAMS = {");
  lines.push('    "Tampa Bay Rays", "New York Yankees", "Baltimore Orioles", "Toronto Blue Jays", "Boston Red Sox",');
  lines.push('    "Minnesota Twins", "Cleveland Guardians", "Detroit Tigers", "Kansas City Royals", "Chicago White Sox",');
  lines.push('    "Texas Rangers", "Houston Astros", "Seattle Mariners", "Los Angeles Angels", "Oakland Athletics",');
  lines.push('    "Athletics",');
  lines.push("}");
  lines.push("STAT_RE = re.compile(r'^(\\d+)\\s+(\\d+)\\s+\\.\\d+\\s+(\\S+)')");
  lines.push("");
  lines.push("");
  lines.push("def run(");
  lines.push("    playwright: Playwright,");
  lines.push("    max_teams: int = " + cfg.maxTeams + ",");
  lines.push(") -> list:");
  lines.push('    print("  American League Top " + str(max_teams) + " Teams\\n")');
  lines.push("");
  lines.push("    port = get_free_port()");
  lines.push('    profile_dir = get_temp_profile_dir("mlb_com")');
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
  lines.push("        all_al = []");
  lines.push("        i = 0");
  lines.push("        while i < len(text_lines) - 1:");
  lines.push("            line = text_lines[i]");
  lines.push("            if line in AL_TEAMS:");
  lines.push("                # Next non-empty line should have stats: W L PCT GB ...");
  lines.push("                stat_line = text_lines[i + 1]");
  lines.push("                m = STAT_RE.match(stat_line)");
  lines.push("                if m:");
  lines.push("                    wins = int(m.group(1))");
  lines.push("                    losses = int(m.group(2))");
  lines.push("                    gb = m.group(3)");
  lines.push("                    all_al.append({'name': line, 'wins': wins, 'losses': losses, 'gb': gb})");
  lines.push("            i += 1");
  lines.push("");
  lines.push("        # Sort by wins descending, then losses ascending");
  lines.push("        all_al.sort(key=lambda t: (-t['wins'], t['losses']))");
  lines.push("        results = all_al[:max_teams]");
  lines.push("");
  lines.push("        # Recalculate GB from top team");
  lines.push("        if results:");
  lines.push("            top_w, top_l = results[0]['wins'], results[0]['losses']");
  lines.push("            for r in results:");
  lines.push("                diff = ((top_w - r['wins']) + (r['losses'] - top_l)) / 2");
  lines.push("                r['gb'] = '-' if diff == 0 else str(diff)");
  lines.push("");
  lines.push('        print("=" * 60)');
  lines.push('        print("MLB American League Standings (Top " + str(max_teams) + ")")');
  lines.push('        print("=" * 60)');
  lines.push("        print(f\"{'Team':<25} {'W':>3} {'L':>3} {'GB':>5}\")");
  lines.push("        print('-' * 40)");
  lines.push("        for idx, r in enumerate(results, 1):");
  lines.push("            label = str(idx) + '. ' + r['name']");
  lines.push("            print(f\"{label:<25} {r['wins']:>3} {r['losses']:>3} {r['gb']:>5}\")");
  lines.push("");
  lines.push('        print(f"\\nTotal AL teams found: {len(all_al)}")');
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

    const STAT_RE = /^(\d+)\s+(\d+)\s+\.\d+\s+(\S+)/;
    const allAL = [];

    for (let i = 0; i < tLines.length - 1; i++) {
      const line = tLines[i];
      if (AL_TEAMS.has(line)) {
        const statLine = tLines[i + 1];
        const m = statLine.match(STAT_RE);
        if (m) {
          allAL.push({
            name: line,
            wins: parseInt(m[1]),
            losses: parseInt(m[2]),
            gb: m[3],
          });
        }
      }
    }

    // Sort by wins desc, losses asc
    allAL.sort((a, b) => b.wins - a.wins || a.losses - b.losses);
    const results = allAL.slice(0, CFG.maxTeams);

    // Recalculate GB from top team
    if (results.length > 0) {
      const topW = results[0].wins;
      const topL = results[0].losses;
      for (const r of results) {
        const diff = ((topW - r.wins) + (r.losses - topL)) / 2;
        r.gb = diff === 0 ? "-" : String(diff);
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log("MLB American League Standings (Top " + CFG.maxTeams + ")");
    console.log("=".repeat(60));
    console.log("Team".padEnd(25) + " W".padStart(3) + "  L".padStart(3) + "    GB".padStart(5));
    console.log("-".repeat(40));
    for (let idx = 0; idx < results.length; idx++) {
      const r = results[idx];
      const label = (idx + 1) + ". " + r.name;
      console.log(label.padEnd(25) + String(r.wins).padStart(3) + String(r.losses).padStart(4) + r.gb.padStart(6));
    }
    console.log("\nTotal AL teams found: " + allAL.length);

    // Generate Python
    const pyCode = genPython(CFG, recorder);
    const pyPath = path.join(__dirname, "mlb_standings.py");
    fs.writeFileSync(pyPath, pyCode);
    console.log("Python script written to:", pyPath);

  } catch(e) {
    console.error("Error:", e.message);
  } finally {
    await stagehand.close();
  }
})();
