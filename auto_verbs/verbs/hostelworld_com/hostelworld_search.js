const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Hostelworld – Hostel Search  
 *
 * Searches for hostels on Hostelworld and extracts name, price, rating, distance.
 */

const CFG = {
  baseUrl: "https://www.hostelworld.com/hostels",
  city: "Barcelona",
  guests: 2,
  maxResults: 5,
  waits: { page: 10000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  const lines = [];
  lines.push('"""');
  lines.push("Auto-generated Playwright script (Python)");
  lines.push("Hostelworld - Hostel Search");
  lines.push("City: " + cfg.city);
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
  lines.push("RATING_RE = re.compile(r'^\\d+\\.\\d$')");
  lines.push("RATING_LABELS = {'Superb', 'Fabulous', 'Very Good', 'Good', 'Average'}");
  lines.push("PRICE_RE = re.compile(r'^US\\$[\\d,.]+$')");
  lines.push("DIST_RE = re.compile(r'^[\\d.]+km from city centre$')");
  lines.push("");
  lines.push("");
  lines.push("def run(");
  lines.push("    playwright: Playwright,");
  lines.push('    city: str = "' + cfg.city + '",');
  lines.push("    guests: int = " + cfg.guests + ",");
  lines.push("    max_results: int = " + cfg.maxResults + ",");
  lines.push(") -> list:");
  lines.push('    print(f"  City: {city}")');
  lines.push('    print(f"  Guests: {guests}\\n")');
  lines.push("");
  lines.push("    port = get_free_port()");
  lines.push('    profile_dir = get_temp_profile_dir("hostelworld_com")');
  lines.push("    chrome_proc = launch_chrome(profile_dir, port)");
  lines.push("    ws_url = wait_for_cdp_ws(port)");
  lines.push("    browser = playwright.chromium.connect_over_cdp(ws_url)");
  lines.push("    context = browser.contexts[0]");
  lines.push("    page = context.pages[0] if context.pages else context.new_page()");
  lines.push("    results = []");
  lines.push("");
  lines.push("    try:");
  lines.push('        url = f"' + cfg.baseUrl + '/{city}"');
  lines.push('        print(f"Loading {url}...")');
  lines.push("        page.goto(url)");
  lines.push('        page.wait_for_load_state("domcontentloaded")');
  lines.push("        page.wait_for_timeout(10000)");
  lines.push('        print(f"  Loaded: {page.url}")');
  lines.push("");
  lines.push("        text = page.evaluate(\"document.body ? document.body.innerText : ''\") or \"\"");
  lines.push('        text_lines = [l.strip() for l in text.split("\\n") if l.strip()]');
  lines.push("");
  lines.push("        # Parse hostel listings");
  lines.push("        # Pattern: 'Hostel' marker -> name -> rating -> label -> (count) -> distance -> ... -> Dorms From -> price");
  lines.push("        i = 0");
  lines.push("        while i < len(text_lines) and len(results) < max_results:");
  lines.push("            line = text_lines[i]");
  lines.push('            if line == "Hostel" and i + 1 < len(text_lines):');
  lines.push("                name = text_lines[i + 1] if i + 1 < len(text_lines) else \"\"");
  lines.push("                rating = \"\"");
  lines.push("                distance = \"N/A\"");
  lines.push("                price = \"N/A\"");
  lines.push("");
  lines.push("                # Look forward for rating, distance, price");
  lines.push("                for j in range(i + 2, min(i + 20, len(text_lines))):");
  lines.push("                    jline = text_lines[j]");
  lines.push("                    if RATING_RE.match(jline) and not rating:");
  lines.push("                        label = text_lines[j + 1] if j + 1 < len(text_lines) else \"\"");
  lines.push('                        rating = jline + " " + label if label in RATING_LABELS else jline');
  lines.push("                    elif DIST_RE.match(jline):");
  lines.push("                        distance = jline");
  lines.push('                    elif jline == "Dorms From" and j + 1 < len(text_lines):');
  lines.push("                        price = text_lines[j + 1]");
  lines.push("                        break");
  lines.push('                    elif jline == "Hostel":');
  lines.push("                        # reached next listing, take what we have");
  lines.push("                        break");
  lines.push("");
  lines.push("                if name:");
  lines.push("                    results.append({");
  lines.push('                        "name": name,');
  lines.push('                        "price": price,');
  lines.push('                        "rating": rating,');
  lines.push('                        "distance": distance,');
  lines.push("                    })");
  lines.push("                i += 2");
  lines.push("            else:");
  lines.push("                i += 1");
  lines.push("");
  lines.push('        print("=" * 60)');
  lines.push('        print(f"Hostels in {city}")');
  lines.push('        print("=" * 60)');
  lines.push("        for idx, r in enumerate(results, 1):");
  lines.push("            print(f\"\\n{idx}. {r['name']}\")");
  lines.push("            print(f\"   Price/night: {r['price']}\")");
  lines.push("            print(f\"   Rating:      {r['rating']}\")");
  lines.push("            print(f\"   Distance:    {r['distance']}\")");
  lines.push("");
  lines.push('        print(f"\\nFound {len(results)} hostels")');
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
    const url = CFG.baseUrl + "/" + CFG.city;
    console.log("Loading " + url + "...");
    recorder.record("page.goto", { url });
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await new Promise(r => setTimeout(r, CFG.waits.page));
    console.log("  URL:", page.url());

    const text = await page.evaluate(() => document.body ? document.body.innerText : "");
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

    const RATING_RE = /^\d+\.\d$/;
    const RATING_LABELS = new Set(["Superb", "Fabulous", "Very Good", "Good", "Average"]);
    const DIST_RE = /^[\d.]+km from city centre$/;
    const results = [];
    let i = 0;

    while (i < lines.length && results.length < CFG.maxResults) {
      const line = lines[i];
      if (line === "Hostel" && i + 1 < lines.length) {
        const name = lines[i + 1];
        let rating = "";
        let distance = "N/A";
        let price = "N/A";

        for (let j = i + 2; j < Math.min(i + 20, lines.length); j++) {
          const jline = lines[j];
          if (RATING_RE.test(jline) && !rating) {
            const label = (j + 1 < lines.length) ? lines[j + 1] : "";
            rating = RATING_LABELS.has(label) ? jline + " " + label : jline;
          } else if (DIST_RE.test(jline)) {
            distance = jline;
          } else if (jline === "Dorms From" && j + 1 < lines.length) {
            price = lines[j + 1];
            break;
          } else if (jline === "Hostel") {
            break;
          }
        }

        if (name) {
          results.push({ name, price, rating, distance });
        }
        i += 2;
      } else {
        i++;
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log("Hostels in " + CFG.city);
    console.log("=".repeat(60));
    for (let idx = 0; idx < results.length; idx++) {
      const r = results[idx];
      console.log("\n" + (idx + 1) + ". " + r.name);
      console.log("   Price/night: " + r.price);
      console.log("   Rating:      " + r.rating);
      console.log("   Distance:    " + r.distance);
    }
    console.log("\nFound " + results.length + " hostels");

    // Generate Python
    const pyCode = genPython(CFG, recorder);
    const pyPath = path.join(__dirname, "hostelworld_search.py");
    fs.writeFileSync(pyPath, pyCode);
    console.log("Python script written to:", pyPath);

  } catch(e) {
    console.error("Error:", e.message);
  } finally {
    await stagehand.close();
  }
})();
