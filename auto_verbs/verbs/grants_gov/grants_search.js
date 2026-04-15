const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Grants.gov – Grant Search
 *
 * Searches for grants on simpler.grants.gov and extracts grant details.
 */

const CFG = {
  baseUrl: "https://simpler.grants.gov/search",
  query: "STEM education",
  maxResults: 5,
  waits: { page: 8000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  const lines = [];
  lines.push('"""');
  lines.push("Auto-generated Playwright script (Python)");
  lines.push("Grants.gov - Grant Search");
  lines.push("Query: " + cfg.query);
  lines.push("");
  lines.push("Generated on: " + ts);
  lines.push("Recorded " + n + " browser interactions");
  lines.push('"""');
  lines.push("");
  lines.push("import re");
  lines.push("import os, sys, shutil");
  lines.push("from urllib.parse import quote_plus");
  lines.push("from playwright.sync_api import Playwright, sync_playwright");
  lines.push("");
  lines.push('sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))');
  lines.push("from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws");
  lines.push("");
  lines.push("");
  lines.push("# Grant entry markers");
  lines.push("DATE_RE = re.compile(r'^(?:TBD|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\\s+\\d{1,2},\\s+\\d{4})$')");
  lines.push("STATUS_VALS = {'Open', 'Forecasted', 'Closed', 'Archived'}");
  lines.push("");
  lines.push("");
  lines.push("def run(");
  lines.push("    playwright: Playwright,");
  lines.push('    query: str = "' + cfg.query + '",');
  lines.push("    max_results: int = " + cfg.maxResults + ",");
  lines.push(") -> list:");
  lines.push('    print(f"  Query: {query}")');
  lines.push('    print(f"  Max results: {max_results}\\n")');
  lines.push("");
  lines.push("    port = get_free_port()");
  lines.push('    profile_dir = get_temp_profile_dir("grants_gov")');
  lines.push("    chrome_proc = launch_chrome(profile_dir, port)");
  lines.push("    ws_url = wait_for_cdp_ws(port)");
  lines.push("    browser = playwright.chromium.connect_over_cdp(ws_url)");
  lines.push("    context = browser.contexts[0]");
  lines.push("    page = context.pages[0] if context.pages else context.new_page()");
  lines.push("    results = []");
  lines.push("");
  lines.push("    try:");
  lines.push('        url = f"' + cfg.baseUrl + '?query={quote_plus(query)}"');
  lines.push('        print(f"Loading {url}...")');
  lines.push("        page.goto(url)");
  lines.push('        page.wait_for_load_state("domcontentloaded")');
  lines.push("        page.wait_for_timeout(8000)");
  lines.push('        print(f"  Loaded: {page.url}")');
  lines.push("");
  lines.push("        text = page.evaluate(\"document.body ? document.body.innerText : ''\") or \"\"");
  lines.push('        text_lines = [l.strip() for l in text.split("\\n") if l.strip()]');
  lines.push("");
  lines.push("        # Parse grant entries from text");
  lines.push("        # Pattern: close_date, status, title, number, agency, posted_date, expected_awards, award_min, award_max");
  lines.push("        i = 0");
  lines.push("        while i < len(text_lines) and len(results) < max_results:");
  lines.push("            line = text_lines[i]");
  lines.push("            # Look for a date line followed by a status");
  lines.push("            if DATE_RE.match(line) and i + 1 < len(text_lines) and text_lines[i + 1] in STATUS_VALS:");
  lines.push("                close_date = line");
  lines.push("                status = text_lines[i + 1]");
  lines.push("                title = text_lines[i + 2] if i + 2 < len(text_lines) else \"\"");
  lines.push("                # Skip 'Number:' line");
  lines.push("                agency = \"\"");
  lines.push("                award_min = \"\"");
  lines.push("                award_max = \"\"");
  lines.push("                # Look ahead for agency and funding");
  lines.push("                for j in range(i + 3, min(i + 10, len(text_lines))):");
  lines.push("                    jline = text_lines[j]");
  lines.push('                    if jline.startswith("Number:"):');
  lines.push("                        continue");
  lines.push('                    if jline.startswith("Posted date:"):');
  lines.push("                        continue");
  lines.push('                    if jline.startswith("Expected awards:"):');
  lines.push("                        continue");
  lines.push('                    if jline.startswith("$"):');
  lines.push("                        if not award_min:");
  lines.push("                            award_min = jline");
  lines.push("                        else:");
  lines.push("                            award_max = jline");
  lines.push("                            break");
  lines.push("                    elif not agency and not jline.startswith(\"$\") and DATE_RE.match(jline) is None and jline not in STATUS_VALS:");
  lines.push("                        agency = jline");
  lines.push("");
  lines.push('                funding = award_min + " - " + award_max if award_min and award_max else award_min or "N/A"');
  lines.push("                results.append({");
  lines.push('                    "title": title,');
  lines.push('                    "agency": agency,');
  lines.push('                    "funding": funding,');
  lines.push('                    "close_date": close_date,');
  lines.push("                })");
  lines.push("                i += 8  # skip past this entry");
  lines.push("            else:");
  lines.push("                i += 1");
  lines.push("");
  lines.push('        print("=" * 70)');
  lines.push('        print(f"Grants.gov Search: {query}")');
  lines.push('        print("=" * 70)');
  lines.push("        for idx, r in enumerate(results, 1):");
  lines.push("            print(f\"\\n{idx}. {r['title']}\")");
  lines.push("            print(f\"   Agency:     {r['agency']}\")");
  lines.push("            print(f\"   Funding:    {r['funding']}\")");
  lines.push("            print(f\"   Close Date: {r['close_date']}\")");
  lines.push("");
  lines.push('        print(f"\\nFound {len(results)} grants")');
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
    const url = CFG.baseUrl + "?query=" + encodeURIComponent(CFG.query);
    console.log("Loading " + url + "...");
    recorder.record("page.goto", { url });
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await new Promise(r => setTimeout(r, CFG.waits.page));
    console.log("  URL:", page.url());

    const text = await page.evaluate(() => document.body ? document.body.innerText : "");
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

    // Parse grant entries
    const DATE_RE = /^(?:TBD|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4})$/;
    const STATUS_VALS = new Set(["Open", "Forecasted", "Closed", "Archived"]);
    const results = [];
    let i = 0;

    while (i < lines.length && results.length < CFG.maxResults) {
      const line = lines[i];
      if (DATE_RE.test(line) && i + 1 < lines.length && STATUS_VALS.has(lines[i + 1])) {
        const closeDate = line;
        const status = lines[i + 1];
        const title = lines[i + 2] || "";
        let agency = "";
        let awardMin = "";
        let awardMax = "";

        for (let j = i + 3; j < Math.min(i + 10, lines.length); j++) {
          const jline = lines[j];
          if (jline.startsWith("Number:") || jline.startsWith("Posted date:") || jline.startsWith("Expected awards:")) continue;
          if (jline.startsWith("$")) {
            if (!awardMin) awardMin = jline;
            else { awardMax = jline; break; }
          } else if (!agency && !DATE_RE.test(jline) && !STATUS_VALS.has(jline)) {
            agency = jline;
          }
        }

        const funding = awardMin && awardMax ? awardMin + " - " + awardMax : awardMin || "N/A";
        results.push({ title, agency, funding, closeDate });
        i += 8;
      } else {
        i++;
      }
    }

    console.log("\n" + "=".repeat(70));
    console.log("Grants.gov Search: " + CFG.query);
    console.log("=".repeat(70));
    for (let idx = 0; idx < results.length; idx++) {
      const r = results[idx];
      console.log("\n" + (idx + 1) + ". " + r.title);
      console.log("   Agency:     " + r.agency);
      console.log("   Funding:    " + r.funding);
      console.log("   Close Date: " + r.closeDate);
    }
    console.log("\nFound " + results.length + " grants");

    // Generate Python
    const pyCode = genPython(CFG, recorder);
    const pyPath = path.join(__dirname, "grants_search.py");
    fs.writeFileSync(pyPath, pyCode);
    console.log("Python script written to:", pyPath);

  } catch(e) {
    console.error("Error:", e.message);
  } finally {
    await stagehand.close();
  }
})();
