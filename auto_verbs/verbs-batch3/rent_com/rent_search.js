const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Rent.com – Apartment Search
 *
 * Searches for apartments and extracts listings.
 */

const CFG = {
  baseUrl: "https://www.rent.com/illinois/chicago-apartments/2-bedrooms",
  location: "Chicago, IL",
  bedrooms: 2,
  maxResults: 5,
  waits: { page: 10000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  const lines = [];
  lines.push('"""');
  lines.push("Auto-generated Playwright script (Python)");
  lines.push("Rent.com - Apartment Search");
  lines.push("Location: " + cfg.location + ", Bedrooms: " + cfg.bedrooms + "+");
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
  lines.push("PRICE_RE = re.compile(r'^\\$[\\d,]+\\+?$')");
  lines.push("");
  lines.push("");
  lines.push("def run(");
  lines.push("    playwright: Playwright,");
  lines.push('    url: str = "' + cfg.baseUrl + '",');
  lines.push("    max_results: int = " + cfg.maxResults + ",");
  lines.push(") -> list:");
  lines.push('    print(f"  URL: {url}\\n")');
  lines.push("");
  lines.push("    port = get_free_port()");
  lines.push('    profile_dir = get_temp_profile_dir("rent_com")');
  lines.push("    chrome_proc = launch_chrome(profile_dir, port)");
  lines.push("    ws_url = wait_for_cdp_ws(port)");
  lines.push("    browser = playwright.chromium.connect_over_cdp(ws_url)");
  lines.push("    context = browser.contexts[0]");
  lines.push("    page = context.pages[0] if context.pages else context.new_page()");
  lines.push("    results = []");
  lines.push("");
  lines.push("    try:");
  lines.push('        print(f"Loading {url}...")');
  lines.push('        page.goto(url, wait_until="domcontentloaded")');
  lines.push("        page.wait_for_timeout(10000)");
  lines.push('        print(f"  Loaded: {page.url}")');
  lines.push("");
  lines.push("        text = page.evaluate(\"document.body ? document.body.innerText : ''\") or \"\"");
  lines.push('        text_lines = [l.strip() for l in text.split("\\n") if l.strip()]');
  lines.push("");
  lines.push("        # Skip to search results ('Rentals Available')");
  lines.push("        i = 0");
  lines.push("        while i < len(text_lines):");
  lines.push("            if 'Rentals Available' in text_lines[i]:");
  lines.push("                i += 1");
  lines.push("                break");
  lines.push("            i += 1");
  lines.push("");
  lines.push("        # Skip 'Sort by:' and 'Best Match'");
  lines.push("        while i < len(text_lines) and text_lines[i] in ('Sort by:', 'Best Match'):");
  lines.push("            i += 1");
  lines.push("");
  lines.push("        while i < len(text_lines) and len(results) < max_results:");
  lines.push("            line = text_lines[i]");
  lines.push("");
  lines.push("            # 'Save' marker appears right after price in each listing");
  lines.push("            if line == 'Save' and i > 0 and i + 5 < len(text_lines):");
  lines.push("                price = text_lines[i - 1]");
  lines.push("                if PRICE_RE.match(price) or price == 'Contact for Price':");
  lines.push("                    beds = text_lines[i + 1]");
  lines.push("                    bath = text_lines[i + 2]");
  lines.push("                    sqft = text_lines[i + 3]");
  lines.push("                    address = text_lines[i + 4]");
  lines.push("                    name = text_lines[i + 5]");
  lines.push("");
  lines.push("                    # Extract neighborhood from address");
  lines.push("                    neighborhood = address.split(', ')[1] if ', ' in address else 'N/A'");
  lines.push("");
  lines.push("                    results.append({");
  lines.push("                        'name': name,");
  lines.push("                        'price': price,");
  lines.push("                        'bedrooms': beds,");
  lines.push("                        'neighborhood': address,");
  lines.push("                    })");
  lines.push("");
  lines.push("            i += 1");
  lines.push("");
  lines.push('        print("=" * 60)');
  lines.push('        print("Apartments in ' + cfg.location + ' (' + cfg.bedrooms + '+ bed)")');
  lines.push('        print("=" * 60)');
  lines.push("        for idx, r in enumerate(results, 1):");
  lines.push("            print(f\"\\n{idx}. {r['name']}\")");
  lines.push("            print(f\"   Price:    {r['price']}\")");
  lines.push("            print(f\"   Beds:     {r['bedrooms']}\")");
  lines.push("            print(f\"   Address:  {r['neighborhood']}\")");
  lines.push("");
  lines.push('        print(f"\\nFound {len(results)} listings")');
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

  const PRICE_RE = /^\$[\d,]+\+?$/;

  try {
    console.log("Loading " + CFG.baseUrl);
    recorder.record("page.goto", { url: CFG.baseUrl });
    await page.goto(CFG.baseUrl, { waitUntil: "domcontentloaded" });
    await new Promise(r => setTimeout(r, CFG.waits.page));
    console.log("  URL:", page.url());

    const text = await page.evaluate(() => document.body ? document.body.innerText : "");
    const tLines = text.split("\n").map(l => l.trim()).filter(Boolean);

    const results = [];

    // Skip to "Rentals Available"
    let i = 0;
    while (i < tLines.length) {
      if (tLines[i].includes("Rentals Available")) { i++; break; }
      i++;
    }
    // Skip sort options
    while (i < tLines.length && (tLines[i] === "Sort by:" || tLines[i] === "Best Match")) i++;

    while (i < tLines.length && results.length < CFG.maxResults) {
      const line = tLines[i];

      if (line === "Save" && i > 0 && i + 5 < tLines.length) {
        const price = tLines[i - 1];
        if (PRICE_RE.test(price) || price === "Contact for Price") {
          const beds = tLines[i + 1];
          const bath = tLines[i + 2];
          const sqft = tLines[i + 3];
          const address = tLines[i + 4];
          const name = tLines[i + 5];

          results.push({ name, price, bedrooms: beds, neighborhood: address });
        }
      }
      i++;
    }

    console.log("\n" + "=".repeat(60));
    console.log("Apartments in " + CFG.location + " (" + CFG.bedrooms + "+ bed)");
    console.log("=".repeat(60));
    for (let idx = 0; idx < results.length; idx++) {
      const r = results[idx];
      console.log("\n" + (idx + 1) + ". " + r.name);
      console.log("   Price:    " + r.price);
      console.log("   Beds:     " + r.bedrooms);
      console.log("   Address:  " + r.neighborhood);
    }
    console.log("\nFound " + results.length + " listings");

    // Generate Python
    const pyCode = genPython(CFG, recorder);
    const pyPath = path.join(__dirname, "rent_search.py");
    fs.writeFileSync(pyPath, pyCode);
    console.log("Python script written to:", pyPath);

  } catch(e) {
    console.error("Error:", e.message);
  } finally {
    await stagehand.close();
  }
})();
