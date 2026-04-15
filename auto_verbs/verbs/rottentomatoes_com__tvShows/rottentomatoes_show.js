const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Rotten Tomatoes – TV Show Lookup
 *
 * Looks up a TV show and extracts ratings and info.
 */

const CFG = {
  show: "Severance",
  slug: "severance",
  waits: { page: 8000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  const lines = [];
  lines.push('"""');
  lines.push("Auto-generated Playwright script (Python)");
  lines.push("Rotten Tomatoes - TV Show Lookup");
  lines.push("Show: " + cfg.show);
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
  lines.push("SEASONS_RE = re.compile(r'(\\d+) Seasons?')");
  lines.push("SCORE_RE = re.compile(r'^(\\d+)%$')");
  lines.push("");
  lines.push("");
  lines.push("def run(");
  lines.push("    playwright: Playwright,");
  lines.push('    slug: str = "' + cfg.slug + '",');
  lines.push('    show: str = "' + cfg.show + '",');
  lines.push(") -> dict:");
  lines.push('    print(f"  Show: {show}\\n")');
  lines.push("");
  lines.push("    port = get_free_port()");
  lines.push('    profile_dir = get_temp_profile_dir("rottentomatoes_com")');
  lines.push("    chrome_proc = launch_chrome(profile_dir, port)");
  lines.push("    ws_url = wait_for_cdp_ws(port)");
  lines.push("    browser = playwright.chromium.connect_over_cdp(ws_url)");
  lines.push("    context = browser.contexts[0]");
  lines.push("    page = context.pages[0] if context.pages else context.new_page()");
  lines.push("    result = {}");
  lines.push("");
  lines.push("    try:");
  lines.push('        url = f"https://www.rottentomatoes.com/tv/{slug}"');
  lines.push('        print(f"Loading {url}...")');
  lines.push('        page.goto(url, wait_until="domcontentloaded")');
  lines.push("        page.wait_for_timeout(8000)");
  lines.push('        print(f"  Loaded: {page.url}")');
  lines.push("");
  lines.push("        text = page.evaluate(\"document.body ? document.body.innerText : ''\") or \"\"");
  lines.push('        text_lines = [l.strip() for l in text.split("\\n") if l.strip()]');
  lines.push("");
  lines.push("        tomatometer = 'N/A'");
  lines.push("        audience_score = 'N/A'");
  lines.push("        seasons = 'N/A'");
  lines.push("        synopsis = 'N/A'");
  lines.push("");
  lines.push("        for i, line in enumerate(text_lines):");
  lines.push("            # Tomatometer");
  lines.push("            if 'Tomatometer' in line and i > 0:");
  lines.push("                sm = SCORE_RE.match(text_lines[i - 1])");
  lines.push("                if sm:");
  lines.push("                    tomatometer = sm.group(1) + '%'");
  lines.push("");
  lines.push("            # Audience score (Popcornmeter)");
  lines.push("            if 'Popcornmeter' in line and i > 0:");
  lines.push("                sm = SCORE_RE.match(text_lines[i - 1])");
  lines.push("                if sm:");
  lines.push("                    audience_score = sm.group(1) + '%'");
  lines.push("");
  lines.push("            # Seasons from info line");
  lines.push("            sm = SEASONS_RE.search(line)");
  lines.push("            if sm:");
  lines.push("                seasons = sm.group(1)");
  lines.push("");
  lines.push("            # Synopsis");
  lines.push("            if line == 'Synopsis' and i + 1 < len(text_lines):");
  lines.push("                synopsis = text_lines[i + 1]");
  lines.push("");
  lines.push("        result = {");
  lines.push("            'show': show,");
  lines.push("            'tomatometer': tomatometer,");
  lines.push("            'audience_score': audience_score,");
  lines.push("            'seasons': seasons,");
  lines.push("            'synopsis': synopsis,");
  lines.push("        }");
  lines.push("");
  lines.push('        print("=" * 60)');
  lines.push('        print(f"{show} - Rotten Tomatoes")');
  lines.push('        print("=" * 60)');
  lines.push("        print(f\"Tomatometer:    {tomatometer}\")");
  lines.push("        print(f\"Audience Score: {audience_score}\")");
  lines.push("        print(f\"Seasons:        {seasons}\")");
  lines.push("        print(f\"\\nSynopsis:\\n{synopsis}\")");
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
  lines.push("    return result");
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

  const SEASONS_RE = /(\d+) Seasons?/;
  const SCORE_RE = /^(\d+)%$/;

  try {
    const url = "https://www.rottentomatoes.com/tv/" + CFG.slug;
    console.log("Loading " + url);
    recorder.record("page.goto", { url });
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await new Promise(r => setTimeout(r, CFG.waits.page));
    console.log("  URL:", page.url());

    const text = await page.evaluate(() => document.body ? document.body.innerText : "");
    const tLines = text.split("\n").map(l => l.trim()).filter(Boolean);

    let tomatometer = "N/A", audienceScore = "N/A", seasons = "N/A", synopsis = "N/A";

    for (let i = 0; i < tLines.length; i++) {
      const line = tLines[i];

      if (line.includes("Tomatometer") && i > 0) {
        const sm = tLines[i - 1].match(SCORE_RE);
        if (sm) tomatometer = sm[1] + "%";
      }

      if (line.includes("Popcornmeter") && i > 0) {
        const sm = tLines[i - 1].match(SCORE_RE);
        if (sm) audienceScore = sm[1] + "%";
      }

      const sm = line.match(SEASONS_RE);
      if (sm) seasons = sm[1];

      if (line === "Synopsis" && i + 1 < tLines.length) {
        synopsis = tLines[i + 1];
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log(CFG.show + " - Rotten Tomatoes");
    console.log("=".repeat(60));
    console.log("Tomatometer:    " + tomatometer);
    console.log("Audience Score: " + audienceScore);
    console.log("Seasons:        " + seasons);
    console.log("\nSynopsis:\n" + synopsis);

    // Generate Python
    const pyCode = genPython(CFG, recorder);
    const pyPath = path.join(__dirname, "rottentomatoes_show.py");
    fs.writeFileSync(pyPath, pyCode);
    console.log("\nPython script written to:", pyPath);

  } catch(e) {
    console.error("Error:", e.message);
  } finally {
    await stagehand.close();
  }
})();
