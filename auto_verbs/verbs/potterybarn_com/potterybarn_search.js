const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Pottery Barn – Product Search
 *
 * Searches for products and extracts listings with details.
 */

const CFG = {
  baseUrl: "https://www.potterybarn.com/search/results.html",
  query: "sofa",
  maxResults: 5,
  waits: { page: 10000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  const lines = [];
  lines.push('"""');
  lines.push("Auto-generated Playwright script (Python)");
  lines.push("Pottery Barn - Product Search");
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
  lines.push("PRICE_RE = re.compile(r'^\\$\\s+[\\d,]+')");
  lines.push("COLORS_RE = re.compile(r'^\\+\\s+(\\d+)\\s+more$')");
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
  lines.push('    profile_dir = get_temp_profile_dir("potterybarn_com")');
  lines.push("    chrome_proc = launch_chrome(profile_dir, port)");
  lines.push("    ws_url = wait_for_cdp_ws(port)");
  lines.push("    browser = playwright.chromium.connect_over_cdp(ws_url)");
  lines.push("    context = browser.contexts[0]");
  lines.push("    page = context.pages[0] if context.pages else context.new_page()");
  lines.push("    results = []");
  lines.push("");
  lines.push("    try:");
  lines.push('        url = f"' + cfg.baseUrl + '?words={quote_plus(query)}"');
  lines.push('        print(f"Loading {url}...")');
  lines.push('        page.goto(url, wait_until="domcontentloaded")');
  lines.push("        page.wait_for_timeout(10000)");
  lines.push('        print(f"  Loaded: {page.url}")');
  lines.push("");
  lines.push("        text = page.evaluate(\"document.body ? document.body.innerText : ''\") or \"\"");
  lines.push('        text_lines = [l.strip() for l in text.split("\\n") if l.strip()]');
  lines.push("");
  lines.push("        # Skip to search results");
  lines.push("        i = 0");
  lines.push("        while i < len(text_lines):");
  lines.push("            if text_lines[i] == 'Best Match':");
  lines.push("                i += 1");
  lines.push("                break");
  lines.push("            i += 1");
  lines.push("");
  lines.push("        while i < len(text_lines) and len(results) < max_results:");
  lines.push("            line = text_lines[i]");
  lines.push("");
  lines.push("            if line == 'Contract Grade':");
  lines.push("                # Product name is the next line");
  lines.push("                name = text_lines[i + 1] if i + 1 < len(text_lines) else 'Unknown'");
  lines.push("");
  lines.push("                # Find price (look ahead up to 6 lines)");
  lines.push("                price = 'N/A'");
  lines.push("                for j in range(i + 2, min(i + 8, len(text_lines))):");
  lines.push("                    if PRICE_RE.match(text_lines[j]):");
  lines.push("                        price = text_lines[j]");
  lines.push("                        break");
  lines.push("");
  lines.push("                # Find colors (look back for '+ N more')");
  lines.push("                colors = 'N/A'");
  lines.push("                for j in range(i - 1, max(i - 6, 0), -1):");
  lines.push("                    cm = COLORS_RE.match(text_lines[j])");
  lines.push("                    if cm:");
  lines.push("                        colors = cm.group(1) + '+ colors'");
  lines.push("                        break");
  lines.push("");
  lines.push("                results.append({");
  lines.push("                    'name': name,");
  lines.push("                    'price': price,");
  lines.push("                    'colors': colors,");
  lines.push("                })");
  lines.push("");
  lines.push("            i += 1");
  lines.push("");
  lines.push('        print("=" * 60)');
  lines.push('        print(f"Pottery Barn: {query}")');
  lines.push('        print("=" * 60)');
  lines.push("        for idx, r in enumerate(results, 1):");
  lines.push("            print(f\"\\n{idx}. {r['name']}\")");
  lines.push("            print(f\"   Price:  {r['price']}\")");
  lines.push("            print(f\"   Colors: {r['colors']}\")");
  lines.push("");
  lines.push('        print(f"\\nFound {len(results)} products")');
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

  const PRICE_RE = /^\$\s+[\d,]+/;
  const COLORS_RE = /^\+\s+(\d+)\s+more$/;

  try {
    const url = CFG.baseUrl + "?words=" + encodeURIComponent(CFG.query);
    console.log("Loading " + url);
    recorder.record("page.goto", { url });
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await new Promise(r => setTimeout(r, CFG.waits.page));
    console.log("  URL:", page.url());

    const text = await page.evaluate(() => document.body ? document.body.innerText : "");
    const tLines = text.split("\n").map(l => l.trim()).filter(Boolean);

    const results = [];

    // Skip to "Best Match"
    let i = 0;
    while (i < tLines.length) {
      if (tLines[i] === "Best Match") { i++; break; }
      i++;
    }

    while (i < tLines.length && results.length < CFG.maxResults) {
      const line = tLines[i];

      if (line === "Contract Grade") {
        const name = i + 1 < tLines.length ? tLines[i + 1] : "Unknown";

        let price = "N/A";
        for (let j = i + 2; j < Math.min(i + 8, tLines.length); j++) {
          if (PRICE_RE.test(tLines[j])) {
            price = tLines[j];
            break;
          }
        }

        let colors = "N/A";
        for (let j = i - 1; j > Math.max(i - 6, 0); j--) {
          const cm = tLines[j].match(COLORS_RE);
          if (cm) {
            colors = cm[1] + "+ colors";
            break;
          }
        }

        results.push({ name, price, colors });
      }
      i++;
    }

    console.log("\n" + "=".repeat(60));
    console.log("Pottery Barn: " + CFG.query);
    console.log("=".repeat(60));
    for (let idx = 0; idx < results.length; idx++) {
      const r = results[idx];
      console.log("\n" + (idx + 1) + ". " + r.name);
      console.log("   Price:  " + r.price);
      console.log("   Colors: " + r.colors);
    }
    console.log("\nFound " + results.length + " products");

    // Generate Python
    const pyCode = genPython(CFG, recorder);
    const pyPath = path.join(__dirname, "potterybarn_search.py");
    fs.writeFileSync(pyPath, pyCode);
    console.log("Python script written to:", pyPath);

  } catch(e) {
    console.error("Error:", e.message);
  } finally {
    await stagehand.close();
  }
})();
