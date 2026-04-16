const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Rome2Rio – Travel Route Search
 *
 * Searches for travel routes between cities.
 */

const CFG = {
  origin: "Paris",
  destination: "Amsterdam",
  maxResults: 5,
  waits: { page: 10000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  const lines = [];
  lines.push('"""');
  lines.push("Auto-generated Playwright script (Python)");
  lines.push("Rome2Rio - Travel Route Search");
  lines.push("From: " + cfg.origin + " To: " + cfg.destination);
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
  lines.push("TRANSPORT_TYPES = {'train', 'rideshare', 'bus', 'plane', 'car'}");
  lines.push("DURATION_RE = re.compile(r'^\\d+h(?:\\s+\\d+m)?$')");
  lines.push("PRICE_RE = re.compile(r'^\\$[\\d,]+')");
  lines.push("");
  lines.push("");
  lines.push("def run(");
  lines.push("    playwright: Playwright,");
  lines.push('    origin: str = "' + cfg.origin + '",');
  lines.push('    destination: str = "' + cfg.destination + '",');
  lines.push("    max_results: int = " + cfg.maxResults + ",");
  lines.push(") -> list:");
  lines.push('    print(f"  From: {origin} To: {destination}\\n")');
  lines.push("");
  lines.push("    port = get_free_port()");
  lines.push('    profile_dir = get_temp_profile_dir("rome2rio_com")');
  lines.push("    chrome_proc = launch_chrome(profile_dir, port)");
  lines.push("    ws_url = wait_for_cdp_ws(port)");
  lines.push("    browser = playwright.chromium.connect_over_cdp(ws_url)");
  lines.push("    context = browser.contexts[0]");
  lines.push("    page = context.pages[0] if context.pages else context.new_page()");
  lines.push("    results = []");
  lines.push("");
  lines.push("    try:");
  lines.push('        url = f"https://www.rome2rio.com/s/{origin}/{destination}"');
  lines.push('        print(f"Loading {url}...")');
  lines.push('        page.goto(url, wait_until="domcontentloaded")');
  lines.push("        page.wait_for_timeout(10000)");
  lines.push('        print(f"  Loaded: {page.url}")');
  lines.push("");
  lines.push("        text = page.evaluate(\"document.body ? document.body.innerText : ''\") or \"\"");
  lines.push('        text_lines = [l.strip() for l in text.split("\\n") if l.strip()]');
  lines.push("");
  lines.push("        # Skip to route options (after 'Select an option below')");
  lines.push("        i = 0");
  lines.push("        while i < len(text_lines):");
  lines.push("            if 'Select an option below' in text_lines[i]:");
  lines.push("                i += 1");
  lines.push("                break");
  lines.push("            i += 1");
  lines.push("");
  lines.push("        while i < len(text_lines) and len(results) < max_results:");
  lines.push("            line = text_lines[i]");
  lines.push("");
  lines.push("            if line in TRANSPORT_TYPES:");
  lines.push("                # Look back for mode name");
  lines.push("                mode = 'Unknown'");
  lines.push("                for j in range(i - 1, max(i - 5, 0), -1):");
  lines.push("                    t = text_lines[j]");
  lines.push("                    if t in ('Train', 'Rideshare', 'Bus', 'Fly') or t.startswith('Drive'):");
  lines.push("                        mode = t");
  lines.push("                        break");
  lines.push("");
  lines.push("                # Look forward for duration and price");
  lines.push("                duration = 'N/A'");
  lines.push("                price = 'N/A'");
  lines.push("                for j in range(i + 1, min(i + 5, len(text_lines))):");
  lines.push("                    if DURATION_RE.match(text_lines[j]) and duration == 'N/A':");
  lines.push("                        duration = text_lines[j]");
  lines.push("                    if PRICE_RE.match(text_lines[j]):");
  lines.push("                        price = text_lines[j]");
  lines.push("                        break");
  lines.push("");
  lines.push("                results.append({");
  lines.push("                    'mode': mode,");
  lines.push("                    'duration': duration,");
  lines.push("                    'price': price,");
  lines.push("                })");
  lines.push("");
  lines.push("            i += 1");
  lines.push("");
  lines.push('        print("=" * 60)');
  lines.push('        print(f"Travel: {origin} to {destination}")');
  lines.push('        print("=" * 60)');
  lines.push("        for idx, r in enumerate(results, 1):");
  lines.push("            print(f\"\\n{idx}. {r['mode']}\")");
  lines.push("            print(f\"   Duration: {r['duration']}\")");
  lines.push("            print(f\"   Price:    {r['price']}\")");
  lines.push("");
  lines.push('        print(f"\\nFound {len(results)} routes")');
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

  const TRANSPORT_TYPES = new Set(["train", "rideshare", "bus", "plane", "car"]);
  const DURATION_RE = /^\d+h(?:\s+\d+m)?$/;
  const PRICE_RE = /^\$[\d,]+/;

  try {
    const url = "https://www.rome2rio.com/s/" + CFG.origin + "/" + CFG.destination;
    console.log("Loading " + url);
    recorder.record("page.goto", { url });
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await new Promise(r => setTimeout(r, CFG.waits.page));
    console.log("  URL:", page.url());

    const text = await page.evaluate(() => document.body ? document.body.innerText : "");
    const tLines = text.split("\n").map(l => l.trim()).filter(Boolean);

    const results = [];

    // Skip to route options
    let i = 0;
    while (i < tLines.length) {
      if (tLines[i].includes("Select an option below")) { i++; break; }
      i++;
    }

    while (i < tLines.length && results.length < CFG.maxResults) {
      const line = tLines[i];

      if (TRANSPORT_TYPES.has(line)) {
        // Look back for mode
        let mode = "Unknown";
        for (let j = i - 1; j > Math.max(i - 5, 0); j--) {
          const t = tLines[j];
          if (["Train", "Rideshare", "Bus", "Fly"].includes(t) || t.startsWith("Drive")) {
            mode = t;
            break;
          }
        }

        // Look forward for duration & price
        let duration = "N/A", price = "N/A";
        for (let j = i + 1; j < Math.min(i + 5, tLines.length); j++) {
          if (DURATION_RE.test(tLines[j]) && duration === "N/A") duration = tLines[j];
          if (PRICE_RE.test(tLines[j])) { price = tLines[j]; break; }
        }

        results.push({ mode, duration, price });
      }
      i++;
    }

    console.log("\n" + "=".repeat(60));
    console.log("Travel: " + CFG.origin + " to " + CFG.destination);
    console.log("=".repeat(60));
    for (let idx = 0; idx < results.length; idx++) {
      const r = results[idx];
      console.log("\n" + (idx + 1) + ". " + r.mode);
      console.log("   Duration: " + r.duration);
      console.log("   Price:    " + r.price);
    }
    console.log("\nFound " + results.length + " routes");

    // Generate Python
    const pyCode = genPython(CFG, recorder);
    const pyPath = path.join(__dirname, "rome2rio_search.py");
    fs.writeFileSync(pyPath, pyCode);
    console.log("Python script written to:", pyPath);

  } catch(e) {
    console.error("Error:", e.message);
  } finally {
    await stagehand.close();
  }
})();
