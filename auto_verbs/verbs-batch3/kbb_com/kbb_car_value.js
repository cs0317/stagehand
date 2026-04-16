const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * KBB – Car Value Lookup
 *
 * Looks up the value of a specific car and extracts fair purchase price,
 * trade-in values, and private party values by condition.
 */

const CFG = {
  baseUrl: "https://www.kbb.com",
  make: "toyota",
  model: "camry",
  year: "2020",
  trim: "se",
  bodyStyle: "sedan-4d",
  waits: { page: 10000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  const lines = [];
  lines.push('"""');
  lines.push("Auto-generated Playwright script (Python)");
  lines.push("KBB - Car Value Lookup");
  lines.push("Vehicle: " + cfg.year + " " + cfg.make + " " + cfg.model + " " + cfg.trim.toUpperCase());
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
  lines.push("PRICE_RE = re.compile(r'^\\$[\\d,]+$')");
  lines.push("CONDITIONS = ['Excellent', 'Very Good', 'Good', 'Fair']");
  lines.push("");
  lines.push("");
  lines.push("def run(");
  lines.push("    playwright: Playwright,");
  lines.push('    make: str = "' + cfg.make + '",');
  lines.push('    model: str = "' + cfg.model + '",');
  lines.push('    year: str = "' + cfg.year + '",');
  lines.push('    trim: str = "' + cfg.trim + '",');
  lines.push('    body_style: str = "' + cfg.bodyStyle + '",');
  lines.push(") -> dict:");
  lines.push('    print(f"  Vehicle: {year} {make.title()} {model.title()} {trim.upper()}")');
  lines.push("");
  lines.push("    port = get_free_port()");
  lines.push('    profile_dir = get_temp_profile_dir("kbb_com")');
  lines.push("    chrome_proc = launch_chrome(profile_dir, port)");
  lines.push("    ws_url = wait_for_cdp_ws(port)");
  lines.push("    browser = playwright.chromium.connect_over_cdp(ws_url)");
  lines.push("    context = browser.contexts[0]");
  lines.push("    page = context.pages[0] if context.pages else context.new_page()");
  lines.push("    result = {}");
  lines.push("");
  lines.push("    try:");
  lines.push('        url = f"' + cfg.baseUrl + '/{make}/{model}/{year}/{trim}-{body_style}/"');
  lines.push('        print(f"Loading {url}...")');
  lines.push("        page.goto(url)");
  lines.push('        page.wait_for_load_state("domcontentloaded")');
  lines.push("        page.wait_for_timeout(10000)");
  lines.push('        print(f"  Loaded: {page.url}")');
  lines.push("");
  lines.push("        text = page.evaluate(\"document.body ? document.body.innerText : ''\") or \"\"");
  lines.push('        text_lines = [l.strip() for l in text.split("\\n") if l.strip()]');
  lines.push("");
  lines.push("        # Find 'Values and Prices' section");
  lines.push("        fair_price = None");
  lines.push("        trade_in = {}");
  lines.push("        private_party = {}");
  lines.push("");
  lines.push("        i = 0");
  lines.push("        while i < len(text_lines):");
  lines.push("            line = text_lines[i]");
  lines.push("");
  lines.push('            if line == "Fair Purchase Price" and i + 1 < len(text_lines):');
  lines.push("                nxt = text_lines[i + 1]");
  lines.push("                if PRICE_RE.match(nxt) and not fair_price:");
  lines.push("                    fair_price = nxt");
  lines.push("                    i += 2");
  lines.push("                    continue");
  lines.push("");
  lines.push("            if line in CONDITIONS:");
  lines.push("                cond = line");
  lines.push("                if i + 2 < len(text_lines):");
  lines.push("                    ti = text_lines[i + 1]");
  lines.push("                    pp = text_lines[i + 2]");
  lines.push("                    if PRICE_RE.match(ti) and PRICE_RE.match(pp):");
  lines.push("                        trade_in[cond] = ti");
  lines.push("                        private_party[cond] = pp");
  lines.push("                        i += 3");
  lines.push("                        continue");
  lines.push("");
  lines.push("            i += 1");
  lines.push("");
  lines.push('        title = f"{year} {make.title()} {model.title()} {trim.upper()}"');
  lines.push('        print("=" * 60)');
  lines.push('        print(f"KBB Values for {title}")');
  lines.push('        print("=" * 60)');
  lines.push('        print(f"\\nFair Purchase Price: {fair_price or \'N/A\'}")');
  lines.push('        print(f"\\nTrade-In Values:")');
  lines.push("        for cond in CONDITIONS:");
  lines.push('            print(f"  {cond:>10}: {trade_in.get(cond, \'N/A\')}")');
  lines.push('        print(f"\\nPrivate Party Values:")');
  lines.push("        for cond in CONDITIONS:");
  lines.push('            print(f"  {cond:>10}: {private_party.get(cond, \'N/A\')}")');
  lines.push("");
  lines.push("        result = {");
  lines.push('            "vehicle": title,');
  lines.push('            "fair_purchase_price": fair_price,');
  lines.push('            "trade_in": trade_in,');
  lines.push('            "private_party": private_party,');
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
    const slug = CFG.trim + "-" + CFG.bodyStyle;
    const url = CFG.baseUrl + "/" + CFG.make + "/" + CFG.model + "/" + CFG.year + "/" + slug + "/";
    console.log("Loading " + url);
    recorder.record("page.goto", { url });
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await new Promise(r => setTimeout(r, CFG.waits.page));
    console.log("  URL:", page.url());

    const text = await page.evaluate(() => document.body ? document.body.innerText : "");
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

    const PRICE_RE = /^\$[\d,]+$/;
    const CONDITIONS = ["Excellent", "Very Good", "Good", "Fair"];
    let fairPrice = null;
    const tradeIn = {};
    const privateParty = {};

    let i = 0;
    while (i < lines.length) {
      const line = lines[i];

      if (line === "Fair Purchase Price" && i + 1 < lines.length) {
        const nxt = lines[i + 1];
        if (PRICE_RE.test(nxt) && !fairPrice) {
          fairPrice = nxt;
          i += 2;
          continue;
        }
      }

      if (CONDITIONS.includes(line)) {
        const cond = line;
        if (i + 2 < lines.length) {
          const ti = lines[i + 1];
          const pp = lines[i + 2];
          if (PRICE_RE.test(ti) && PRICE_RE.test(pp)) {
            tradeIn[cond] = ti;
            privateParty[cond] = pp;
            i += 3;
            continue;
          }
        }
      }

      i++;
    }

    const title = CFG.year + " " + CFG.make.charAt(0).toUpperCase() + CFG.make.slice(1) + " " +
                  CFG.model.charAt(0).toUpperCase() + CFG.model.slice(1) + " " + CFG.trim.toUpperCase();

    console.log("\n" + "=".repeat(60));
    console.log("KBB Values for " + title);
    console.log("=".repeat(60));
    console.log("\nFair Purchase Price: " + (fairPrice || "N/A"));
    console.log("\nTrade-In Values:");
    for (const cond of CONDITIONS) {
      console.log("  " + cond.padStart(10) + ": " + (tradeIn[cond] || "N/A"));
    }
    console.log("\nPrivate Party Values:");
    for (const cond of CONDITIONS) {
      console.log("  " + cond.padStart(10) + ": " + (privateParty[cond] || "N/A"));
    }

    // Generate Python
    const pyCode = genPython(CFG, recorder);
    const pyPath = path.join(__dirname, "kbb_car_value.py");
    fs.writeFileSync(pyPath, pyCode);
    console.log("\nPython script written to:", pyPath);

  } catch(e) {
    console.error("Error:", e.message);
  } finally {
    await stagehand.close();
  }
})();
