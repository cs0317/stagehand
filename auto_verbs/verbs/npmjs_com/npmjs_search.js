const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * npm – Package Search
 *
 * Searches npm registry and extracts package info.
 */

const CFG = {
  baseUrl: "https://www.npmjs.com/search",
  query: "state management",
  maxResults: 5,
  waits: { page: 8000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  const lines = [];
  lines.push('"""');
  lines.push("Auto-generated Playwright script (Python)");
  lines.push("npm - Package Search");
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
  lines.push("VERSION_RE = re.compile(r'^\\u2022 ([\\d.]+) \\u2022')");
  lines.push("DOWNLOADS_RE = re.compile(r'^[\\d,]+$')");
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
  lines.push('    profile_dir = get_temp_profile_dir("npmjs_com")');
  lines.push("    chrome_proc = launch_chrome(profile_dir, port)");
  lines.push("    ws_url = wait_for_cdp_ws(port)");
  lines.push("    browser = playwright.chromium.connect_over_cdp(ws_url)");
  lines.push("    context = browser.contexts[0]");
  lines.push("    page = context.pages[0] if context.pages else context.new_page()");
  lines.push("    results = []");
  lines.push("");
  lines.push("    try:");
  lines.push('        url = f"' + cfg.baseUrl + '?q={quote_plus(query)}"');
  lines.push('        print(f"Loading {url}...")');
  lines.push('        page.goto(url, wait_until="domcontentloaded")');
  lines.push("        page.wait_for_timeout(8000)");
  lines.push('        print(f"  Loaded: {page.url}")');
  lines.push("");
  lines.push("        text = page.evaluate(\"document.body ? document.body.innerText : ''\") or \"\"");
  lines.push('        text_lines = [l.strip() for l in text.split("\\n") if l.strip()]');
  lines.push("");
  lines.push("        # Parse packages - each package ends with a downloads count");
  lines.push("        # Working backwards from downloads count to find version and name");
  lines.push("        i = 0");
  lines.push("        # Skip to 'Search results'");
  lines.push("        while i < len(text_lines):");
  lines.push('            if "packages found" in text_lines[i]:');
  lines.push("                i += 1");
  lines.push("                break");
  lines.push("            i += 1");
  lines.push("");
  lines.push("        # Skip 'Sort by' line");
  lines.push("        if i < len(text_lines) and text_lines[i].startswith('Sort'):");
  lines.push("            i += 1");
  lines.push("");
  lines.push("        current_name = None");
  lines.push("        current_desc = None");
  lines.push("        current_version = None");
  lines.push("");
  lines.push("        while i < len(text_lines) and len(results) < max_results:");
  lines.push("            line = text_lines[i]");
  lines.push("");
  lines.push("            # Downloads count (end of a package entry)");
  lines.push("            if DOWNLOADS_RE.match(line) and current_name:");
  lines.push("                downloads = line");
  lines.push("                results.append({");
  lines.push("                    'name': current_name,");
  lines.push("                    'description': current_desc or 'N/A',");
  lines.push("                    'version': current_version or 'N/A',");
  lines.push("                    'downloads': downloads,");
  lines.push("                })");
  lines.push("                current_name = None");
  lines.push("                current_desc = None");
  lines.push("                current_version = None");
  lines.push("                i += 1");
  lines.push("                continue");
  lines.push("");
  lines.push("            # Version line");
  lines.push("            vm = VERSION_RE.match(line)");
  lines.push("            if vm:");
  lines.push("                current_version = vm.group(1)");
  lines.push("                i += 1");
  lines.push("                # Skip duplicate version line");
  lines.push("                if i < len(text_lines) and text_lines[i].startswith('published'):");
  lines.push("                    i += 1");
  lines.push("                continue");
  lines.push("");
  lines.push("            # Package name (appears right after previous downloads or at start)");
  lines.push("            if current_name is None:");
  lines.push("                current_name = line");
  lines.push("                current_desc = text_lines[i + 1] if i + 1 < len(text_lines) else None");
  lines.push("");
  lines.push("            i += 1");
  lines.push("");
  lines.push('        print("=" * 60)');
  lines.push('        print(f"npm Search: {query}")');
  lines.push('        print("=" * 60)');
  lines.push("        for idx, r in enumerate(results, 1):");
  lines.push("            print(f\"\\n{idx}. {r['name']} (v{r['version']})\")");
  lines.push("            print(f\"   {r['description']}\")");
  lines.push("            print(f\"   Weekly downloads: {r['downloads']}\")");
  lines.push("");
  lines.push('        print(f"\\nFound {len(results)} packages")');
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
    const url = CFG.baseUrl + "?q=" + encodeURIComponent(CFG.query);
    console.log("Loading " + url);
    recorder.record("page.goto", { url });
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await new Promise(r => setTimeout(r, CFG.waits.page));
    console.log("  URL:", page.url());

    const text = await page.evaluate(() => document.body ? document.body.innerText : "");
    const tLines = text.split("\n").map(l => l.trim()).filter(Boolean);

    const VERSION_RE = /^\u2022 ([\d.]+) \u2022/;
    const DOWNLOADS_RE = /^[\d,]+$/;
    const results = [];

    // Skip to search results
    let i = 0;
    while (i < tLines.length) {
      if (tLines[i].includes("packages found")) { i++; break; }
      i++;
    }
    if (i < tLines.length && tLines[i].startsWith("Sort")) i++;

    let curName = null, curDesc = null, curVersion = null;

    while (i < tLines.length && results.length < CFG.maxResults) {
      const line = tLines[i];

      if (DOWNLOADS_RE.test(line) && curName) {
        results.push({ name: curName, description: curDesc || "N/A", version: curVersion || "N/A", downloads: line });
        curName = curDesc = curVersion = null;
        i++;
        continue;
      }

      const vm = line.match(VERSION_RE);
      if (vm) {
        curVersion = vm[1];
        i++;
        if (i < tLines.length && tLines[i].startsWith("published")) i++;
        continue;
      }

      if (curName === null) {
        curName = line;
        curDesc = (i + 1 < tLines.length) ? tLines[i + 1] : null;
      }

      i++;
    }

    console.log("\n" + "=".repeat(60));
    console.log("npm Search: " + CFG.query);
    console.log("=".repeat(60));
    for (let idx = 0; idx < results.length; idx++) {
      const r = results[idx];
      console.log("\n" + (idx + 1) + ". " + r.name + " (v" + r.version + ")");
      console.log("   " + r.description);
      console.log("   Weekly downloads: " + r.downloads);
    }
    console.log("\nFound " + results.length + " packages");

    // Generate Python
    const pyCode = genPython(CFG, recorder);
    const pyPath = path.join(__dirname, "npmjs_search.py");
    fs.writeFileSync(pyPath, pyCode);
    console.log("Python script written to:", pyPath);

  } catch(e) {
    console.error("Error:", e.message);
  } finally {
    await stagehand.close();
  }
})();
