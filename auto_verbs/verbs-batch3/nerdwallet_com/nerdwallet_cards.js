const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * NerdWallet – Cash Back Credit Cards
 *
 * Extracts top cash back credit cards with name, annual fee, rewards rate,
 * and sign-up bonus.
 */

const CFG = {
  url: "https://www.nerdwallet.com/best/credit-cards/cash-back",
  maxResults: 5,
  waits: { page: 10000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  const lines = [];
  lines.push('"""');
  lines.push("Auto-generated Playwright script (Python)");
  lines.push("NerdWallet - Cash Back Credit Cards");
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
  lines.push("def run(");
  lines.push("    playwright: Playwright,");
  lines.push("    max_results: int = " + cfg.maxResults + ",");
  lines.push(") -> list:");
  lines.push('    print("  Cash Back Credit Cards\\n")');
  lines.push("");
  lines.push("    port = get_free_port()");
  lines.push('    profile_dir = get_temp_profile_dir("nerdwallet_com")');
  lines.push("    chrome_proc = launch_chrome(profile_dir, port)");
  lines.push("    ws_url = wait_for_cdp_ws(port)");
  lines.push("    browser = playwright.chromium.connect_over_cdp(ws_url)");
  lines.push("    context = browser.contexts[0]");
  lines.push("    page = context.pages[0] if context.pages else context.new_page()");
  lines.push("    results = []");
  lines.push("");
  lines.push("    try:");
  lines.push('        url = "' + cfg.url + '"');
  lines.push('        print(f"Loading {url}...")');
  lines.push('        page.goto(url, wait_until="domcontentloaded")');
  lines.push("        page.wait_for_timeout(10000)");
  lines.push('        print(f"  Loaded: {page.url}")');
  lines.push("");
  lines.push("        text = page.evaluate(\"document.body ? document.body.innerText : ''\") or \"\"");
  lines.push('        text_lines = [l.strip() for l in text.split("\\n") if l.strip()]');
  lines.push("");
  lines.push("        # Parse card listings");
  lines.push("        # Pattern: 'Our pick for:' -> card name -> ... -> 'Annual fee' -> fee -> 'Rewards rate' -> rate -> 'Intro offer' -> bonus");
  lines.push("        i = 0");
  lines.push("        while i < len(text_lines) and len(results) < max_results:");
  lines.push("            line = text_lines[i]");
  lines.push("");
  lines.push("            if line.startswith('Our pick for:'):");
  lines.push("                category = line.replace('Our pick for: ', '')");
  lines.push("                # Next non-utility line is the card name");
  lines.push("                name = text_lines[i + 1] if i + 1 < len(text_lines) else 'N/A'");
  lines.push("");
  lines.push("                annual_fee = 'N/A'");
  lines.push("                rewards_rate = 'N/A'");
  lines.push("                intro_offer = 'N/A'");
  lines.push("");
  lines.push("                # Look ahead for details");
  lines.push("                for j in range(i + 2, min(i + 30, len(text_lines))):");
  lines.push("                    jline = text_lines[j]");
  lines.push("                    # Stop at next card");
  lines.push("                    if jline.startswith('Our pick for:'):");
  lines.push("                        break");
  lines.push("                    if jline == 'Annual fee' and j + 1 < len(text_lines):");
  lines.push("                        annual_fee = text_lines[j + 1]");
  lines.push("                    elif jline == 'Rewards rate' and j + 1 < len(text_lines):");
  lines.push("                        rewards_rate = text_lines[j + 1]");
  lines.push("                    elif jline == 'Intro offer' and j + 1 < len(text_lines):");
  lines.push("                        intro_offer = text_lines[j + 1]");
  lines.push("");
  lines.push("                results.append({");
  lines.push("                    'name': name,");
  lines.push("                    'category': category,");
  lines.push("                    'annual_fee': annual_fee,");
  lines.push("                    'rewards_rate': rewards_rate,");
  lines.push("                    'intro_offer': intro_offer,");
  lines.push("                })");
  lines.push("");
  lines.push("            i += 1");
  lines.push("");
  lines.push('        print("=" * 60)');
  lines.push('        print("NerdWallet: Best Cash Back Credit Cards")');
  lines.push('        print("=" * 60)');
  lines.push("        for idx, r in enumerate(results, 1):");
  lines.push("            print(f\"\\n{idx}. {r['name']}\")");
  lines.push("            print(f\"   Category:    {r['category']}\")");
  lines.push("            print(f\"   Annual Fee:  {r['annual_fee']}\")");
  lines.push("            print(f\"   Rewards:     {r['rewards_rate']}\")");
  lines.push("            print(f\"   Sign-up:     {r['intro_offer']}\")");
  lines.push("");
  lines.push('        print(f"\\nFound {len(results)} cards")');
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
    console.log("Loading " + CFG.url);
    recorder.record("page.goto", { url: CFG.url });
    await page.goto(CFG.url, { waitUntil: "domcontentloaded" });
    await new Promise(r => setTimeout(r, CFG.waits.page));
    console.log("  URL:", page.url());

    const text = await page.evaluate(() => document.body ? document.body.innerText : "");
    const tLines = text.split("\n").map(l => l.trim()).filter(Boolean);

    const results = [];

    for (let i = 0; i < tLines.length && results.length < CFG.maxResults; i++) {
      const line = tLines[i];

      if (line.startsWith("Our pick for:")) {
        const category = line.replace("Our pick for: ", "");
        const name = (i + 1 < tLines.length) ? tLines[i + 1] : "N/A";
        let annualFee = "N/A";
        let rewardsRate = "N/A";
        let introOffer = "N/A";

        for (let j = i + 2; j < Math.min(i + 30, tLines.length); j++) {
          const jl = tLines[j];
          if (jl.startsWith("Our pick for:")) break;
          if (jl === "Annual fee" && j + 1 < tLines.length) annualFee = tLines[j + 1];
          else if (jl === "Rewards rate" && j + 1 < tLines.length) rewardsRate = tLines[j + 1];
          else if (jl === "Intro offer" && j + 1 < tLines.length) introOffer = tLines[j + 1];
        }

        results.push({ name, category, annualFee, rewardsRate, introOffer });
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log("NerdWallet: Best Cash Back Credit Cards");
    console.log("=".repeat(60));
    for (let idx = 0; idx < results.length; idx++) {
      const r = results[idx];
      console.log("\n" + (idx + 1) + ". " + r.name);
      console.log("   Category:    " + r.category);
      console.log("   Annual Fee:  " + r.annualFee);
      console.log("   Rewards:     " + r.rewardsRate);
      console.log("   Sign-up:     " + r.introOffer);
    }
    console.log("\nFound " + results.length + " cards");

    // Generate Python
    const pyCode = genPython(CFG, recorder);
    const pyPath = path.join(__dirname, "nerdwallet_cards.py");
    fs.writeFileSync(pyPath, pyCode);
    console.log("Python script written to:", pyPath);

  } catch(e) {
    console.error("Error:", e.message);
  } finally {
    await stagehand.close();
  }
})();
