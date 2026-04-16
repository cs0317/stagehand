const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * PyPI – Package Search
 *
 * Searches PyPI for packages and extracts listings with versions.
 */

const CFG = {
  baseUrl: "https://pypi.org/search/",
  query: "web scraping",
  maxResults: 5,
  waits: { page: 6000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  const lines = [];
  lines.push('"""');
  lines.push("Auto-generated Playwright script (Python)");
  lines.push("PyPI - Package Search");
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
  lines.push("DATE_RE = re.compile(r'^(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \\d+, \\d{4}$')");
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
  lines.push('    profile_dir = get_temp_profile_dir("pypi_org")');
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
  lines.push("        page.wait_for_timeout(6000)");
  lines.push('        print(f"  Loaded: {page.url}")');
  lines.push("");
  lines.push("        text = page.evaluate(\"document.body ? document.body.innerText : ''\") or \"\"");
  lines.push('        text_lines = [l.strip() for l in text.split("\\n") if l.strip()]');
  lines.push("");
  lines.push("        # Skip to search results");
  lines.push("        i = 0");
  lines.push("        while i < len(text_lines):");
  lines.push("            if text_lines[i] == 'Search results':");
  lines.push("                i += 1");
  lines.push("                break");
  lines.push("            i += 1");
  lines.push("");
  lines.push("        # Skip count line and sort options");
  lines.push("        while i < len(text_lines):");
  lines.push("            if text_lines[i] in ('Relevance', 'Date last updated'):");
  lines.push("                i += 1");
  lines.push("                break");
  lines.push("            i += 1");
  lines.push("");
  lines.push("        # Parse packages: name, date, description");
  lines.push("        packages = []");
  lines.push("        while i < len(text_lines) and len(packages) < max_results:");
  lines.push("            name = text_lines[i]");
  lines.push("            if name == 'Previous' or name.isdigit():");
  lines.push("                break");
  lines.push("            date = text_lines[i + 1] if i + 1 < len(text_lines) else 'N/A'");
  lines.push("            desc = text_lines[i + 2] if i + 2 < len(text_lines) else 'N/A'");
  lines.push("            if DATE_RE.match(date):");
  lines.push("                packages.append({'name': name, 'description': desc, 'date': date})");
  lines.push("                i += 3");
  lines.push("            else:");
  lines.push("                i += 1");
  lines.push("");
  lines.push("        # Fetch version from PyPI JSON API");
  lines.push("        for pkg in packages:");
  lines.push("            try:");
  lines.push("                api_url = f\"https://pypi.org/pypi/{pkg['name']}/json\"");
  lines.push("                version_js = f\"fetch('{api_url}').then(r => r.json()).then(d => d.info.version).catch(() => 'N/A')\"");
  lines.push("                version = page.evaluate(version_js)");
  lines.push("                pkg['version'] = version or 'N/A'");
  lines.push("            except Exception:");
  lines.push("                pkg['version'] = 'N/A'");
  lines.push("            results.append(pkg)");
  lines.push("");
  lines.push('        print("=" * 60)');
  lines.push('        print(f"PyPI: {query}")');
  lines.push('        print("=" * 60)');
  lines.push("        for idx, r in enumerate(results, 1):");
  lines.push("            print(f\"\\n{idx}. {r['name']} (v{r['version']})\")");
  lines.push("            print(f\"   {r['description']}\")");
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

  const DATE_RE = /^(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d+, \d{4}$/;

  try {
    const url = CFG.baseUrl + "?q=" + encodeURIComponent(CFG.query);
    console.log("Loading " + url);
    recorder.record("page.goto", { url });
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await new Promise(r => setTimeout(r, CFG.waits.page));
    console.log("  URL:", page.url());

    const text = await page.evaluate(() => document.body ? document.body.innerText : "");
    const tLines = text.split("\n").map(l => l.trim()).filter(Boolean);

    // Skip to "Search results"
    let i = 0;
    while (i < tLines.length) {
      if (tLines[i] === "Search results") { i++; break; }
      i++;
    }
    // Skip count line and sort options
    while (i < tLines.length) {
      if (tLines[i] === "Relevance" || tLines[i] === "Date last updated") { i++; break; }
      i++;
    }

    // Parse packages: name, date, description
    const packages = [];
    while (i < tLines.length && packages.length < CFG.maxResults) {
      const name = tLines[i];
      if (name === "Previous" || /^\d+$/.test(name)) break;
      const date = i + 1 < tLines.length ? tLines[i + 1] : "N/A";
      const desc = i + 2 < tLines.length ? tLines[i + 2] : "N/A";
      if (DATE_RE.test(date)) {
        packages.push({ name, description: desc, date });
        i += 3;
      } else {
        i++;
      }
    }

    // Fetch version from PyPI JSON API
    for (const pkg of packages) {
      try {
        const apiUrl = "https://pypi.org/pypi/" + pkg.name + "/json";
        const version = await page.evaluate(async (u) => {
          try { const r = await fetch(u); const d = await r.json(); return d.info.version; } catch { return "N/A"; }
        }, apiUrl);
        pkg.version = version || "N/A";
      } catch { pkg.version = "N/A"; }
    }

    console.log("\n" + "=".repeat(60));
    console.log("PyPI: " + CFG.query);
    console.log("=".repeat(60));
    for (let idx = 0; idx < packages.length; idx++) {
      const r = packages[idx];
      console.log("\n" + (idx + 1) + ". " + r.name + " (v" + r.version + ")");
      console.log("   " + r.description);
    }
    console.log("\nFound " + packages.length + " packages");

    // Generate Python
    const pyCode = genPython(CFG, recorder);
    const pyPath = path.join(__dirname, "pypi_search.py");
    fs.writeFileSync(pyPath, pyCode);
    console.log("Python script written to:", pyPath);

  } catch(e) {
    console.error("Error:", e.message);
  } finally {
    await stagehand.close();
  }
})();
