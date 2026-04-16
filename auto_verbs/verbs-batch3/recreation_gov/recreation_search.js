const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Recreation.gov – Campground Search
 *
 * Searches for campgrounds and extracts listings.
 */

const CFG = {
  baseUrl: "https://www.recreation.gov/search",
  query: "Yellowstone",
  maxResults: 5,
  waits: { page: 8000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  const lines = [];
  lines.push('"""');
  lines.push("Auto-generated Playwright script (Python)");
  lines.push("Recreation.gov - Campground Search");
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
  lines.push("PRICE_RE = re.compile(r'^\\$[\\d,]+(?: \\u2013 \\$[\\d,]+)?$')");
  lines.push("SITES_RE = re.compile(r'^(\\d+) Accessible Campsite')");
  lines.push("");
  lines.push("");
  lines.push("def run(");
  lines.push("    playwright: Playwright,");
  lines.push('    query: str = "' + cfg.query + '",');
  lines.push("    max_results: int = " + cfg.maxResults + ",");
  lines.push(") -> list:");
  lines.push('    print(f"  Query: {query}\\n")');
  lines.push("");
  lines.push("    port = get_free_port()");
  lines.push('    profile_dir = get_temp_profile_dir("recreation_gov")');
  lines.push("    chrome_proc = launch_chrome(profile_dir, port)");
  lines.push("    ws_url = wait_for_cdp_ws(port)");
  lines.push("    browser = playwright.chromium.connect_over_cdp(ws_url)");
  lines.push("    context = browser.contexts[0]");
  lines.push("    page = context.pages[0] if context.pages else context.new_page()");
  lines.push("    results = []");
  lines.push("");
  lines.push("    try:");
  lines.push('        url = f"' + cfg.baseUrl + '?q={quote_plus(query)}&entity_type=campground"');
  lines.push('        print(f"Loading {url}...")');
  lines.push('        page.goto(url, wait_until="domcontentloaded")');
  lines.push("        page.wait_for_timeout(8000)");
  lines.push('        print(f"  Loaded: {page.url}")');
  lines.push("");
  lines.push("        text = page.evaluate(\"document.body ? document.body.innerText : ''\") or \"\"");
  lines.push('        text_lines = [l.strip() for l in text.split("\\n") if l.strip()]');
  lines.push("");
  lines.push("        i = 0");
  lines.push("        while i < len(text_lines) and len(results) < max_results:");
  lines.push("            if text_lines[i] == 'CAMPING':");
  lines.push("                name = text_lines[i + 1] if i + 1 < len(text_lines) else 'Unknown'");
  lines.push("");
  lines.push("                # Find location ('Near ...') and fee within next 15 lines");
  lines.push("                location = 'N/A'");
  lines.push("                fee = 'N/A'");
  lines.push("                sites = 'N/A'");
  lines.push("                for j in range(i + 2, min(i + 15, len(text_lines))):");
  lines.push("                    if text_lines[j].startswith('Near '):");
  lines.push("                        location = text_lines[j].replace('Near ', '')");
  lines.push("                    sm = SITES_RE.match(text_lines[j])");
  lines.push("                    if sm:");
  lines.push("                        sites = sm.group(1)");
  lines.push("                    if PRICE_RE.match(text_lines[j]):");
  lines.push("                        fee = text_lines[j] + ' / night'");
  lines.push("                        break");
  lines.push("");
  lines.push("                results.append({");
  lines.push("                    'name': name,");
  lines.push("                    'location': location,");
  lines.push("                    'sites': sites,");
  lines.push("                    'fee': fee,");
  lines.push("                })");
  lines.push("");
  lines.push("            i += 1");
  lines.push("");
  lines.push('        print("=" * 60)');
  lines.push('        print(f"Campgrounds near {query}")');
  lines.push('        print("=" * 60)');
  lines.push("        for idx, r in enumerate(results, 1):");
  lines.push("            print(f\"\\n{idx}. {r['name']}\")");
  lines.push("            print(f\"   Location: {r['location']}\")");
  lines.push("            print(f\"   Sites:    {r['sites']}\")");
  lines.push("            print(f\"   Fee:      {r['fee']}\")");
  lines.push("");
  lines.push('        print(f"\\nFound {len(results)} campgrounds")');
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

  const PRICE_RE = /^\$[\d,]+(?: \u2013 \$[\d,]+)?$/;
  const SITES_RE = /^(\d+) Accessible Campsite/;

  try {
    const url = CFG.baseUrl + "?q=" + encodeURIComponent(CFG.query) + "&entity_type=campground";
    console.log("Loading " + url);
    recorder.record("page.goto", { url });
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await new Promise(r => setTimeout(r, CFG.waits.page));
    console.log("  URL:", page.url());

    const text = await page.evaluate(() => document.body ? document.body.innerText : "");
    const tLines = text.split("\n").map(l => l.trim()).filter(Boolean);

    const results = [];
    let i = 0;

    while (i < tLines.length && results.length < CFG.maxResults) {
      if (tLines[i] === "CAMPING") {
        const name = i + 1 < tLines.length ? tLines[i + 1] : "Unknown";

        let location = "N/A", fee = "N/A", sites = "N/A";
        for (let j = i + 2; j < Math.min(i + 15, tLines.length); j++) {
          if (tLines[j].startsWith("Near ")) {
            location = tLines[j].replace("Near ", "");
          }
          const sm = tLines[j].match(SITES_RE);
          if (sm) sites = sm[1];
          if (PRICE_RE.test(tLines[j])) {
            fee = tLines[j] + " / night";
            break;
          }
        }

        results.push({ name, location, sites, fee });
      }
      i++;
    }

    console.log("\n" + "=".repeat(60));
    console.log("Campgrounds near " + CFG.query);
    console.log("=".repeat(60));
    for (let idx = 0; idx < results.length; idx++) {
      const r = results[idx];
      console.log("\n" + (idx + 1) + ". " + r.name);
      console.log("   Location: " + r.location);
      console.log("   Sites:    " + r.sites);
      console.log("   Fee:      " + r.fee);
    }
    console.log("\nFound " + results.length + " campgrounds");

    // Generate Python
    const pyCode = genPython(CFG, recorder);
    const pyPath = path.join(__dirname, "recreation_search.py");
    fs.writeFileSync(pyPath, pyCode);
    console.log("Python script written to:", pyPath);

  } catch(e) {
    console.error("Error:", e.message);
  } finally {
    await stagehand.close();
  }
})();
