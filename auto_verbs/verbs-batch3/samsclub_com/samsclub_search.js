const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Sam's Club – Product Search
 *
 * Searches for products and extracts listings.
 */

const CFG = {
  baseUrl: "https://www.samsclub.com/s/",
  query: "protein bars",
  maxResults: 5,
  waits: { page: 10000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  const lines = [];
  lines.push('"""');
  lines.push("Auto-generated Playwright script (Python)");
  lines.push("Sam's Club - Product Search");
  lines.push("Query: " + cfg.query);
  lines.push("");
  lines.push("Generated on: " + ts);
  lines.push("Recorded " + n + " browser interactions");
  lines.push('"""');
  lines.push("");
  lines.push("import re");
  lines.push("import os, sys, shutil");
  lines.push("from urllib.parse import quote");
  lines.push("from playwright.sync_api import Playwright, sync_playwright");
  lines.push("");
  lines.push('sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))');
  lines.push("from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws");
  lines.push("");
  lines.push("");
  lines.push("CURRENT_PRICE_RE = re.compile(r'^current price \\$(\\S+)')");
  lines.push("UNIT_PRICE_RE = re.compile(r'^\\$[\\d.]+/\\w+')");
  lines.push("RATING_RE = re.compile(r'^([\\d.]+) out of 5 Stars\\. (\\d+) reviews?')");
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
  lines.push('    profile_dir = get_temp_profile_dir("samsclub_com")');
  lines.push("    chrome_proc = launch_chrome(profile_dir, port)");
  lines.push("    ws_url = wait_for_cdp_ws(port)");
  lines.push("    browser = playwright.chromium.connect_over_cdp(ws_url)");
  lines.push("    context = browser.contexts[0]");
  lines.push("    page = context.pages[0] if context.pages else context.new_page()");
  lines.push("    results = []");
  lines.push("");
  lines.push("    try:");
  lines.push('        url = f"' + cfg.baseUrl + '{quote(query)}"');
  lines.push('        print(f"Loading {url}...")');
  lines.push('        page.goto(url, wait_until="domcontentloaded")');
  lines.push("        page.wait_for_timeout(10000)");
  lines.push('        print(f"  Loaded: {page.url}")');
  lines.push("");
  lines.push("        text = page.evaluate(\"document.body ? document.body.innerText : ''\") or \"\"");
  lines.push('        text_lines = [l.strip() for l in text.split("\\n") if l.strip()]');
  lines.push("");
  lines.push("        # Skip to search results (after 'Relevance' sort option)");
  lines.push("        i = 0");
  lines.push("        while i < len(text_lines):");
  lines.push("            if text_lines[i] == 'Relevance':");
  lines.push("                i += 1");
  lines.push("                break");
  lines.push("            i += 1");
  lines.push("");
  lines.push("        # Skip 'Related searches' section");
  lines.push("        if i < len(text_lines) and text_lines[i] == 'Related searches':");
  lines.push("            while i < len(text_lines) and text_lines[i] != 'Add to Cart':");
  lines.push("                i += 1");
  lines.push("");
  lines.push("        seen = set()");
  lines.push("        while i < len(text_lines) and len(results) < max_results:");
  lines.push("            line = text_lines[i]");
  lines.push("");
  lines.push("            if line == 'Add to Cart' and i > 0:");
  lines.push("                name = text_lines[i - 1]");
  lines.push("                if name in seen:");
  lines.push("                    i += 1");
  lines.push("                    continue");
  lines.push("                seen.add(name)");
  lines.push("");
  lines.push("                # Scan forward for price, unit price, rating");
  lines.push("                price = 'N/A'");
  lines.push("                unit_price = 'N/A'");
  lines.push("                rating = 'N/A'");
  lines.push("");
  lines.push("                for j in range(i + 1, min(i + 10, len(text_lines))):");
  lines.push("                    cm = CURRENT_PRICE_RE.match(text_lines[j])");
  lines.push("                    if cm:");
  lines.push("                        price = '$' + cm.group(1)");
  lines.push("                    if UNIT_PRICE_RE.match(text_lines[j]):");
  lines.push("                        unit_price = text_lines[j]");
  lines.push("                    rm = RATING_RE.match(text_lines[j])");
  lines.push("                    if rm:");
  lines.push("                        rating = f\"{rm.group(1)}/5 ({rm.group(2)} reviews)\"");
  lines.push("                        break");
  lines.push("");
  lines.push("                results.append({");
  lines.push("                    'name': name,");
  lines.push("                    'price': price,");
  lines.push("                    'unit_price': unit_price,");
  lines.push("                    'rating': rating,");
  lines.push("                })");
  lines.push("");
  lines.push("            i += 1");
  lines.push("");
  lines.push('        print("=" * 60)');
  lines.push('        print(f"Sam\\\'s Club: {query}")');
  lines.push('        print("=" * 60)');
  lines.push("        for idx, r in enumerate(results, 1):");
  lines.push("            print(f\"\\n{idx}. {r['name']}\")");
  lines.push("            print(f\"   Price:      {r['price']}\")");
  lines.push("            print(f\"   Unit Price: {r['unit_price']}\")");
  lines.push("            print(f\"   Rating:     {r['rating']}\")");
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

  const CURRENT_PRICE_RE = /^current price \$(\S+)/;
  const UNIT_PRICE_RE = /^\$[\d.]+\/\w+/;
  const RATING_RE = /^([\d.]+) out of 5 Stars\. (\d+) reviews?/;

  try {
    const url = CFG.baseUrl + encodeURIComponent(CFG.query);
    console.log("Loading " + url);
    recorder.record("page.goto", { url });
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await new Promise(r => setTimeout(r, CFG.waits.page));
    console.log("  URL:", page.url());

    const text = await page.evaluate(() => document.body ? document.body.innerText : "");
    const tLines = text.split("\n").map(l => l.trim()).filter(Boolean);

    const results = [];

    // Skip to "Relevance"
    let i = 0;
    while (i < tLines.length) {
      if (tLines[i] === "Relevance") { i++; break; }
      i++;
    }
    // Skip "Related searches"
    if (i < tLines.length && tLines[i] === "Related searches") {
      while (i < tLines.length && tLines[i] !== "Add to Cart") i++;
    }

    const seen = new Set();
    while (i < tLines.length && results.length < CFG.maxResults) {
      const line = tLines[i];

      if (line === "Add to Cart" && i > 0) {
        const name = tLines[i - 1];
        if (seen.has(name)) { i++; continue; }
        seen.add(name);

        let price = "N/A", unitPrice = "N/A", rating = "N/A";
        for (let j = i + 1; j < Math.min(i + 10, tLines.length); j++) {
          const cm = tLines[j].match(CURRENT_PRICE_RE);
          if (cm) price = "$" + cm[1];
          if (UNIT_PRICE_RE.test(tLines[j])) unitPrice = tLines[j];
          const rm = tLines[j].match(RATING_RE);
          if (rm) { rating = rm[1] + "/5 (" + rm[2] + " reviews)"; break; }
        }

        results.push({ name, price, unitPrice, rating });
      }
      i++;
    }

    console.log("\n" + "=".repeat(60));
    console.log("Sam's Club: " + CFG.query);
    console.log("=".repeat(60));
    for (let idx = 0; idx < results.length; idx++) {
      const r = results[idx];
      console.log("\n" + (idx + 1) + ". " + r.name);
      console.log("   Price:      " + r.price);
      console.log("   Unit Price: " + r.unitPrice);
      console.log("   Rating:     " + r.rating);
    }
    console.log("\nFound " + results.length + " products");

    // Generate Python
    const pyCode = genPython(CFG, recorder);
    const pyPath = path.join(__dirname, "samsclub_search.py");
    fs.writeFileSync(pyPath, pyCode);
    console.log("Python script written to:", pyPath);

  } catch(e) {
    console.error("Error:", e.message);
  } finally {
    await stagehand.close();
  }
})();
