const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Lonely Planet – Destination Guide
 *
 * Extracts destination overview, best time to visit, and top attractions.
 */

const CFG = {
  baseUrl: "https://www.lonelyplanet.com",
  country: "japan",
  destination: "tokyo",
  maxAttractions: 5,
  waits: { page: 8000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  const lines = [];
  lines.push('"""');
  lines.push("Auto-generated Playwright script (Python)");
  lines.push("Lonely Planet - Destination Guide");
  lines.push("Destination: " + cfg.destination.charAt(0).toUpperCase() + cfg.destination.slice(1));
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
  lines.push("ATTRACTION_RE = re.compile(r'^ATTRACTION IN (.+)$')");
  lines.push("");
  lines.push("");
  lines.push("def run(");
  lines.push("    playwright: Playwright,");
  lines.push('    country: str = "' + cfg.country + '",');
  lines.push('    destination: str = "' + cfg.destination + '",');
  lines.push("    max_attractions: int = " + cfg.maxAttractions + ",");
  lines.push(") -> dict:");
  lines.push('    print(f"  Destination: {destination.title()}")');
  lines.push("");
  lines.push("    port = get_free_port()");
  lines.push('    profile_dir = get_temp_profile_dir("lonelyplanet_com")');
  lines.push("    chrome_proc = launch_chrome(profile_dir, port)");
  lines.push("    ws_url = wait_for_cdp_ws(port)");
  lines.push("    browser = playwright.chromium.connect_over_cdp(ws_url)");
  lines.push("    context = browser.contexts[0]");
  lines.push("    page = context.pages[0] if context.pages else context.new_page()");
  lines.push("    result = {}");
  lines.push("");
  lines.push("    try:");
  lines.push('        url = f"' + cfg.baseUrl + '/{country}/{destination}"');
  lines.push('        print(f"Loading {url}...")');
  lines.push("        page.goto(url)");
  lines.push('        page.wait_for_load_state("domcontentloaded")');
  lines.push("        page.wait_for_timeout(8000)");
  lines.push('        print(f"  Loaded: {page.url}")');
  lines.push("");
  lines.push("        text = page.evaluate(\"document.body ? document.body.innerText : ''\") or \"\"");
  lines.push('        text_lines = [l.strip() for l in text.split("\\n") if l.strip()]');
  lines.push("");
  lines.push("        # Extract overview (line after 'Why visit {destination}')");
  lines.push("        overview = None");
  lines.push("        best_time = None");
  lines.push("        attractions = []");
  lines.push("");
  lines.push("        i = 0");
  lines.push("        while i < len(text_lines):");
  lines.push("            line = text_lines[i]");
  lines.push("");
  lines.push("            # Overview");
  lines.push("            if line.lower().startswith('why visit') and i + 1 < len(text_lines):");
  lines.push("                overview = text_lines[i + 1]");
  lines.push("");
  lines.push("            # Best time to visit");
  lines.push('            if line == "BEST TIME TO VISIT" and i + 1 < len(text_lines):');
  lines.push("                best_time = text_lines[i + 1]");
  lines.push("");
  lines.push("            # Attractions");
  lines.push("            m = ATTRACTION_RE.match(line)");
  lines.push("            if m and len(attractions) < max_attractions and i + 1 < len(text_lines):");
  lines.push("                area = m.group(1).title()");
  lines.push("                name = text_lines[i + 1]");
  lines.push('                if name != "DISCOVER":');
  lines.push("                    attractions.append({'name': name, 'area': area})");
  lines.push("");
  lines.push("            i += 1");
  lines.push("");
  lines.push('        dest_title = destination.title()');
  lines.push('        print("=" * 60)');
  lines.push('        print(f"Lonely Planet: {dest_title} Destination Guide")');
  lines.push('        print("=" * 60)');
  lines.push('        print(f"\\nOverview:")');
  lines.push("        print(f\"  {overview or 'N/A'}\")");
  lines.push('        print(f"\\nBest Time to Visit:")');
  lines.push("        print(f\"  {best_time or 'N/A'}\")");
  lines.push('        print(f"\\nTop Attractions:")');
  lines.push("        for idx, a in enumerate(attractions, 1):");
  lines.push("            print(f\"  {idx}. {a['name']}\")");
  lines.push("            print(f\"     Area: {a['area']}\")");
  lines.push("");
  lines.push("        result = {");
  lines.push('            "destination": dest_title,');
  lines.push('            "overview": overview,');
  lines.push('            "best_time": best_time,');
  lines.push('            "attractions": attractions,');
  lines.push("        }");
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

  try {
    const url = CFG.baseUrl + "/" + CFG.country + "/" + CFG.destination;
    console.log("Loading " + url);
    recorder.record("page.goto", { url });
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await new Promise(r => setTimeout(r, CFG.waits.page));
    console.log("  URL:", page.url());

    const text = await page.evaluate(() => document.body ? document.body.innerText : "");
    const tLines = text.split("\n").map(l => l.trim()).filter(Boolean);

    const ATTRACTION_RE = /^ATTRACTION IN (.+)$/;
    let overview = null;
    let bestTime = null;
    const attractions = [];

    for (let i = 0; i < tLines.length; i++) {
      const line = tLines[i];

      if (line.toLowerCase().startsWith("why visit") && i + 1 < tLines.length) {
        overview = tLines[i + 1];
      }

      if (line === "BEST TIME TO VISIT" && i + 1 < tLines.length) {
        bestTime = tLines[i + 1];
      }

      const m = line.match(ATTRACTION_RE);
      if (m && attractions.length < CFG.maxAttractions && i + 1 < tLines.length) {
        const area = m[1].replace(/\b\w/g, c => c.toUpperCase()).replace(/\bAND\b/gi, "&");
        const name = tLines[i + 1];
        if (name !== "DISCOVER") {
          attractions.push({ name, area });
        }
      }
    }

    const destTitle = CFG.destination.charAt(0).toUpperCase() + CFG.destination.slice(1);
    console.log("\n" + "=".repeat(60));
    console.log("Lonely Planet: " + destTitle + " Destination Guide");
    console.log("=".repeat(60));
    console.log("\nOverview:");
    console.log("  " + (overview || "N/A"));
    console.log("\nBest Time to Visit:");
    console.log("  " + (bestTime || "N/A"));
    console.log("\nTop Attractions:");
    for (let idx = 0; idx < attractions.length; idx++) {
      const a = attractions[idx];
      console.log("  " + (idx + 1) + ". " + a.name);
      console.log("     Area: " + a.area);
    }

    // Generate Python
    const pyCode = genPython(CFG, recorder);
    const pyPath = path.join(__dirname, "lonelyplanet_destination.py");
    fs.writeFileSync(pyPath, pyCode);
    console.log("\nPython script written to:", pyPath);

  } catch(e) {
    console.error("Error:", e.message);
  } finally {
    await stagehand.close();
  }
})();
