const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Meetup – Group Search
 *
 * Searches for meetup groups and extracts group name, member count, and rating.
 */

const CFG = {
  baseUrl: "https://www.meetup.com/find/",
  query: "hiking",
  location: "us--co--Denver",
  locationLabel: "Denver, CO",
  maxResults: 5,
  waits: { page: 10000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  const lines = [];
  lines.push('"""');
  lines.push("Auto-generated Playwright script (Python)");
  lines.push("Meetup - Group Search");
  lines.push("Query: " + cfg.query + " near " + cfg.locationLabel);
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
  lines.push("MEMBERS_RE = re.compile(r'^([\\d,]+)\\s+members$')");
  lines.push("RATING_RE = re.compile(r'^\\d+\\.\\d$')");
  lines.push("");
  lines.push("");
  lines.push("def run(");
  lines.push("    playwright: Playwright,");
  lines.push('    query: str = "' + cfg.query + '",');
  lines.push('    location: str = "' + cfg.location + '",');
  lines.push('    location_label: str = "' + cfg.locationLabel + '",');
  lines.push("    max_results: int = " + cfg.maxResults + ",");
  lines.push(") -> list:");
  lines.push('    print(f"  Query: {query}")');
  lines.push('    print(f"  Location: {location_label}\\n")');
  lines.push("");
  lines.push("    port = get_free_port()");
  lines.push('    profile_dir = get_temp_profile_dir("meetup_com")');
  lines.push("    chrome_proc = launch_chrome(profile_dir, port)");
  lines.push("    ws_url = wait_for_cdp_ws(port)");
  lines.push("    browser = playwright.chromium.connect_over_cdp(ws_url)");
  lines.push("    context = browser.contexts[0]");
  lines.push("    page = context.pages[0] if context.pages else context.new_page()");
  lines.push("    results = []");
  lines.push("");
  lines.push("    try:");
  lines.push('        from urllib.parse import quote_plus');
  lines.push('        url = f"' + cfg.baseUrl + '?keywords={quote_plus(query)}&location={location}&source=GROUPS&eventType=group"');
  lines.push('        print(f"Loading {url}...")');
  lines.push("        page.goto(url)");
  lines.push('        page.wait_for_load_state("domcontentloaded")');
  lines.push("        page.wait_for_timeout(10000)");
  lines.push('        print(f"  Loaded: {page.url}")');
  lines.push("");
  lines.push("        text = page.evaluate(\"document.body ? document.body.innerText : ''\") or \"\"");
  lines.push('        text_lines = [l.strip() for l in text.split("\\n") if l.strip()]');
  lines.push("");
  lines.push("        # Parse group listings");
  lines.push("        # Pattern: location -> optional rating -> group name -> description -> 'N members'");
  lines.push("        i = 0");
  lines.push("        # Skip to after the category filters (after 'Movements & Politics')");
  lines.push("        while i < len(text_lines):");
  lines.push('            if text_lines[i] == "Movements & Politics":');
  lines.push("                i += 1");
  lines.push("                break");
  lines.push("            i += 1");
  lines.push("");
  lines.push("        # Now parse groups");
  lines.push("        while i < len(text_lines) and len(results) < max_results:");
  lines.push("            line = text_lines[i]");
  lines.push("");
  lines.push("            # Look for members line");
  lines.push("            m = MEMBERS_RE.match(line)");
  lines.push("            if m:");
  lines.push("                members = m.group(1)");
  lines.push("                # Look backwards for group name, rating, location");
  lines.push("                name = None");
  lines.push("                rating = None");
  lines.push("                loc = None");
  lines.push("                desc = None");
  lines.push("");
  lines.push("                # Line before members is description");
  lines.push("                if i >= 2:");
  lines.push("                    desc = text_lines[i - 1]");
  lines.push("                    # Line before desc is name");
  lines.push("                    j = i - 2");
  lines.push("                    name = text_lines[j]");
  lines.push("");
  lines.push("                    # Look further back for rating and location");
  lines.push("                    for k in range(j - 1, max(j - 5, 0), -1):");
  lines.push("                        kline = text_lines[k]");
  lines.push("                        if RATING_RE.match(kline):");
  lines.push("                            rating = kline");
  lines.push("                        elif re.match(r'^[A-Z][a-z]+.*,\\s*[A-Z]{2}$', kline):");
  lines.push("                            loc = kline");
  lines.push("                            break");
  lines.push("");
  lines.push("                if name and name not in ('New group', 'Report Ad'):");
  lines.push("                    results.append({");
  lines.push("                        'name': name,");
  lines.push("                        'members': members,");
  lines.push("                        'rating': rating or 'N/A',");
  lines.push("                        'location': loc or 'N/A',");
  lines.push("                    })");
  lines.push("            i += 1");
  lines.push("");
  lines.push('        print("=" * 60)');
  lines.push('        print(f"Meetup Groups: {query} near {location_label}")');
  lines.push('        print("=" * 60)');
  lines.push("        for idx, r in enumerate(results, 1):");
  lines.push("            print(f\"\\n{idx}. {r['name']}\")");
  lines.push("            print(f\"   Members:  {r['members']}\")");
  lines.push("            print(f\"   Rating:   {r['rating']}\")");
  lines.push("            print(f\"   Location: {r['location']}\")");
  lines.push("");
  lines.push('        print(f"\\nFound {len(results)} groups")');
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
    const url = CFG.baseUrl + "?keywords=" + encodeURIComponent(CFG.query) +
                "&location=" + CFG.location + "&source=GROUPS&eventType=group";
    console.log("Loading " + url);
    recorder.record("page.goto", { url });
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await new Promise(r => setTimeout(r, CFG.waits.page));
    console.log("  URL:", page.url());

    const text = await page.evaluate(() => document.body ? document.body.innerText : "");
    const tLines = text.split("\n").map(l => l.trim()).filter(Boolean);

    const MEMBERS_RE = /^([\d,]+)\s+members$/;
    const RATING_RE = /^\d+\.\d$/;
    const LOC_RE = /^[A-Z][a-z]+.*,\s*[A-Z]{2}$/;
    const results = [];

    // Skip to after category filters
    let i = 0;
    while (i < tLines.length) {
      if (tLines[i] === "Movements & Politics") { i++; break; }
      i++;
    }

    while (i < tLines.length && results.length < CFG.maxResults) {
      const line = tLines[i];
      const m = line.match(MEMBERS_RE);
      if (m) {
        const members = m[1];
        let name = null;
        let rating = null;
        let loc = null;

        // Line before members is description, line before that is name
        if (i >= 2) {
          name = tLines[i - 2];
          // look back for rating and location
          for (let k = i - 3; k >= Math.max(i - 6, 0); k--) {
            const kline = tLines[k];
            if (RATING_RE.test(kline)) {
              rating = kline;
            } else if (LOC_RE.test(kline)) {
              loc = kline;
              break;
            }
          }
        }

        if (name && name !== "New group" && name !== "Report Ad") {
          results.push({ name, members, rating: rating || "N/A", location: loc || "N/A" });
        }
      }
      i++;
    }

    console.log("\n" + "=".repeat(60));
    console.log("Meetup Groups: " + CFG.query + " near " + CFG.locationLabel);
    console.log("=".repeat(60));
    for (let idx = 0; idx < results.length; idx++) {
      const r = results[idx];
      console.log("\n" + (idx + 1) + ". " + r.name);
      console.log("   Members:  " + r.members);
      console.log("   Rating:   " + r.rating);
      console.log("   Location: " + r.location);
    }
    console.log("\nFound " + results.length + " groups");

    // Generate Python
    const pyCode = genPython(CFG, recorder);
    const pyPath = path.join(__dirname, "meetup_search.py");
    fs.writeFileSync(pyPath, pyCode);
    console.log("Python script written to:", pyPath);

  } catch(e) {
    console.error("Error:", e.message);
  } finally {
    await stagehand.close();
  }
})();
