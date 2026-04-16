const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Realtor.com – Home Search
 *
 * Searches for homes for sale with price filter and extracts listings.
 */

const CFG = {
  location: "Austin_TX",
  locationLabel: "Austin, TX",
  priceMin: 300000,
  priceMax: 500000,
  maxResults: 5,
  waits: { page: 10000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  const lines = [];
  lines.push('"""');
  lines.push("Auto-generated Playwright script (Python)");
  lines.push("Realtor.com - Home Search");
  lines.push("Location: " + cfg.locationLabel + ", Price: $" + cfg.priceMin + "-$" + cfg.priceMax);
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
  lines.push("PRICE_RE = re.compile(r'^(?:From)?\\$([\\d,]+)')");
  lines.push("BED_RE = re.compile(r'^(\\d+)bed$')");
  lines.push("BATH_RE = re.compile(r'^([\\d.]+)bath$')");
  lines.push("SQFT_RE = re.compile(r'^([\\d,]+)sqft$')");
  lines.push("");
  lines.push("");
  lines.push("def run(");
  lines.push("    playwright: Playwright,");
  lines.push('    location: str = "' + cfg.location + '",');
  lines.push("    price_min: int = " + cfg.priceMin + ",");
  lines.push("    price_max: int = " + cfg.priceMax + ",");
  lines.push("    max_results: int = " + cfg.maxResults + ",");
  lines.push(") -> list:");
  lines.push('    print(f"  Location: {location}, Price: ${price_min:,}-${price_max:,}\\n")');
  lines.push("");
  lines.push("    port = get_free_port()");
  lines.push('    profile_dir = get_temp_profile_dir("realtor_com")');
  lines.push("    chrome_proc = launch_chrome(profile_dir, port)");
  lines.push("    ws_url = wait_for_cdp_ws(port)");
  lines.push("    browser = playwright.chromium.connect_over_cdp(ws_url)");
  lines.push("    context = browser.contexts[0]");
  lines.push("    page = context.pages[0] if context.pages else context.new_page()");
  lines.push("    results = []");
  lines.push("");
  lines.push("    try:");
  lines.push('        url = f"https://www.realtor.com/realestateandhomes-search/{location}/price-{price_min}-{price_max}"');
  lines.push('        print(f"Loading {url}...")');
  lines.push('        page.goto(url, wait_until="domcontentloaded")');
  lines.push("        page.wait_for_timeout(10000)");
  lines.push('        print(f"  Loaded: {page.url}")');
  lines.push("");
  lines.push("        text = page.evaluate(\"document.body ? document.body.innerText : ''\") or \"\"");
  lines.push('        text_lines = [l.strip() for l in text.split("\\n") if l.strip()]');
  lines.push("");
  lines.push("        i = 0");
  lines.push("        while i < len(text_lines) and len(results) < max_results:");
  lines.push("            line = text_lines[i]");
  lines.push("");
  lines.push("            if line == 'House for sale' and i + 1 < len(text_lines):");
  lines.push("                pm = PRICE_RE.match(text_lines[i + 1])");
  lines.push("                if pm:");
  lines.push("                    price = text_lines[i + 1]");
  lines.push("                    j = i + 2");
  lines.push("");
  lines.push("                    # Skip optional price adjustments like '$500' or '$10k'");
  lines.push("                    if j < len(text_lines) and PRICE_RE.match(text_lines[j]) and len(text_lines[j]) < 8:");
  lines.push("                        j += 1");
  lines.push("");
  lines.push("                    bed = 'N/A'");
  lines.push("                    bath = 'N/A'");
  lines.push("                    sqft = 'N/A'");
  lines.push("                    address = 'N/A'");
  lines.push("");
  lines.push("                    # Parse bed, bath, sqft");
  lines.push("                    while j < min(i + 10, len(text_lines)):");
  lines.push("                        bm = BED_RE.match(text_lines[j])");
  lines.push("                        if bm:");
  lines.push("                            bed = bm.group(1)");
  lines.push("                            j += 1");
  lines.push("                            continue");
  lines.push("                        btm = BATH_RE.match(text_lines[j])");
  lines.push("                        if btm:");
  lines.push("                            bath = btm.group(1)");
  lines.push("                            j += 1");
  lines.push("                            continue");
  lines.push("                        sm = SQFT_RE.match(text_lines[j])");
  lines.push("                        if sm:");
  lines.push("                            sqft = sm.group(1)");
  lines.push("                            j += 1");
  lines.push("                            break");
  lines.push("                        j += 1");
  lines.push("");
  lines.push("                    # Skip 'X square feet' and optional lot lines");
  lines.push("                    while j < min(i + 15, len(text_lines)):");
  lines.push("                        if 'square feet' in text_lines[j] or 'square foot' in text_lines[j] or text_lines[j].endswith('sqft lot'):");
  lines.push("                            j += 1");
  lines.push("                        else:");
  lines.push("                            break");
  lines.push("");
  lines.push("                    # Address is the next 2 lines");
  lines.push("                    if j + 1 < len(text_lines):");
  lines.push("                        street = text_lines[j]");
  lines.push("                        city_state = text_lines[j + 1]");
  lines.push("                        address = f'{street}, {city_state}'");
  lines.push("");
  lines.push("                    results.append({");
  lines.push("                        'address': address,");
  lines.push("                        'price': price,");
  lines.push("                        'bedrooms': bed,");
  lines.push("                        'bathrooms': bath,");
  lines.push("                        'sqft': sqft,");
  lines.push("                    })");
  lines.push("");
  lines.push("            i += 1");
  lines.push("");
  lines.push('        print("=" * 60)');
  lines.push('        loc_label = location.replace("_", ", ")');
  lines.push('        print(f"Homes for sale in {loc_label}")');
  lines.push('        print("=" * 60)');
  lines.push("        for idx, r in enumerate(results, 1):");
  lines.push("            print(f\"\\n{idx}. {r['address']}\")");
  lines.push("            print(f\"   Price:     {r['price']}\")");
  lines.push("            print(f\"   Bedrooms:  {r['bedrooms']}\")");
  lines.push("            print(f\"   Bathrooms: {r['bathrooms']}\")");
  lines.push("            print(f\"   Sqft:      {r['sqft']}\")");
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

  const PRICE_RE = /^(?:From)?\$([\d,]+)/;
  const BED_RE = /^(\d+)bed$/;
  const BATH_RE = /^([\d.]+)bath$/;
  const SQFT_RE = /^([\d,]+)sqft$/;

  try {
    const url = "https://www.realtor.com/realestateandhomes-search/" + CFG.location + "/price-" + CFG.priceMin + "-" + CFG.priceMax;
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
      const line = tLines[i];

      if (line === "House for sale" && i + 1 < tLines.length) {
        const pm = tLines[i + 1].match(PRICE_RE);
        if (pm) {
          const price = tLines[i + 1];
          let j = i + 2;

          // Skip optional small price adjustments
          if (j < tLines.length && PRICE_RE.test(tLines[j]) && tLines[j].length < 8) j++;

          let bed = "N/A", bath = "N/A", sqft = "N/A", address = "N/A";

          while (j < Math.min(i + 10, tLines.length)) {
            const bm = tLines[j].match(BED_RE);
            if (bm) { bed = bm[1]; j++; continue; }
            const btm = tLines[j].match(BATH_RE);
            if (btm) { bath = btm[1]; j++; continue; }
            const sm = tLines[j].match(SQFT_RE);
            if (sm) { sqft = sm[1]; j++; break; }
            j++;
          }

          // Skip "square feet/foot" and lot lines
          while (j < Math.min(i + 15, tLines.length)) {
            if (tLines[j].includes("square feet") || tLines[j].includes("square foot") || tLines[j].endsWith("sqft lot")) {
              j++;
            } else { break; }
          }

          // Address: next 2 lines
          if (j + 1 < tLines.length) {
            address = tLines[j] + ", " + tLines[j + 1];
          }

          results.push({ address, price, bedrooms: bed, bathrooms: bath, sqft });
        }
      }
      i++;
    }

    console.log("\n" + "=".repeat(60));
    console.log("Homes for sale in " + CFG.locationLabel);
    console.log("=".repeat(60));
    for (let idx = 0; idx < results.length; idx++) {
      const r = results[idx];
      console.log("\n" + (idx + 1) + ". " + r.address);
      console.log("   Price:     " + r.price);
      console.log("   Bedrooms:  " + r.bedrooms);
      console.log("   Bathrooms: " + r.bathrooms);
      console.log("   Sqft:      " + r.sqft);
    }
    console.log("\nFound " + results.length + " listings");

    // Generate Python
    const pyCode = genPython(CFG, recorder);
    const pyPath = path.join(__dirname, "realtor_search.py");
    fs.writeFileSync(pyPath, pyCode);
    console.log("Python script written to:", pyPath);

  } catch(e) {
    console.error("Error:", e.message);
  } finally {
    await stagehand.close();
  }
})();
