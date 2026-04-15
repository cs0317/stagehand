const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Petfinder – Adoptable Pet Search
 *
 * Searches for adoptable dogs near a ZIP code and extracts pet listings.
 */

const CFG = {
  baseUrl: "https://www.petfinder.com/search/dogs-for-adoption/us/ca/beverly-hills-90210/",
  animalType: "dogs",
  location: "90210",
  maxResults: 5,
  waits: { page: 8000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  const lines = [];
  lines.push('"""');
  lines.push("Auto-generated Playwright script (Python)");
  lines.push("Petfinder - Adoptable Pet Search");
  lines.push("Animal type: " + cfg.animalType + ", Location: " + cfg.location);
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
  lines.push("MILES_RE = re.compile(r'^\\d+ miles? away$')");
  lines.push("AGE_GENDER_RE = re.compile(r'^(\\w+)\\s*[\\u2022]\\s*(\\w+)$')");
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
  lines.push('    profile_dir = get_temp_profile_dir("petfinder_com")');
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
  lines.push("        page.wait_for_timeout(8000)");
  lines.push('        print(f"  Loaded: {page.url}")');
  lines.push("");
  lines.push("        text = page.evaluate(\"document.body ? document.body.innerText : ''\") or \"\"");
  lines.push('        text_lines = [l.strip() for l in text.split("\\n") if l.strip()]');
  lines.push("");
  lines.push("        # Skip to 'pet results'");
  lines.push("        i = 0");
  lines.push("        while i < len(text_lines):");
  lines.push("            if text_lines[i] == 'pet results':");
  lines.push("                i += 1");
  lines.push("                break");
  lines.push("            i += 1");
  lines.push("");
  lines.push("        while i < len(text_lines) and len(results) < max_results:");
  lines.push("            line = text_lines[i]");
  lines.push("");
  lines.push("            # Detect 'X miles away' → pet entry");
  lines.push("            if MILES_RE.match(line):");
  lines.push("                name = text_lines[i - 1] if i > 0 else 'Unknown'");
  lines.push("                age_gender_line = text_lines[i + 1] if i + 1 < len(text_lines) else ''");
  lines.push("                breed = text_lines[i + 2] if i + 2 < len(text_lines) else 'Unknown'");
  lines.push("");
  lines.push("                # Parse age and gender from 'Adult • Male'");
  lines.push("                ag = AGE_GENDER_RE.match(age_gender_line)");
  lines.push("                age = ag.group(1) if ag else 'Unknown'");
  lines.push("                gender = ag.group(2) if ag else 'Unknown'");
  lines.push("");
  lines.push("                # Find shelter name");
  lines.push("                shelter = 'Unknown'");
  lines.push("                for j in range(i + 3, min(i + 20, len(text_lines))):");
  lines.push("                    if text_lines[j] == 'Shelter':");
  lines.push("                        shelter = text_lines[j + 1] if j + 1 < len(text_lines) else 'Unknown'");
  lines.push("                        break");
  lines.push("");
  lines.push("                results.append({");
  lines.push("                    'name': name,");
  lines.push("                    'breed': breed,");
  lines.push("                    'age': age,");
  lines.push("                    'gender': gender,");
  lines.push("                    'shelter': shelter,");
  lines.push("                })");
  lines.push("");
  lines.push("            i += 1");
  lines.push("");
  lines.push('        print("=" * 60)');
  lines.push('        print("Adoptable Dogs near ' + cfg.location + '")');
  lines.push('        print("=" * 60)');
  lines.push("        for idx, r in enumerate(results, 1):");
  lines.push("            print(f\"\\n{idx}. {r['name']}\")");
  lines.push("            print(f\"   Breed:   {r['breed']}\")");
  lines.push("            print(f\"   Age:     {r['age']}\")");
  lines.push("            print(f\"   Gender:  {r['gender']}\")");
  lines.push("            print(f\"   Shelter: {r['shelter']}\")");
  lines.push("");
  lines.push('        print(f"\\nFound {len(results)} pets")');
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

  const MILES_RE = /^\d+ miles? away$/;
  const AGE_GENDER_RE = /^(\w+)\s*[\u2022]\s*(\w+)$/;

  try {
    console.log("Loading " + CFG.baseUrl);
    recorder.record("page.goto", { url: CFG.baseUrl });
    await page.goto(CFG.baseUrl, { waitUntil: "domcontentloaded" });
    await new Promise(r => setTimeout(r, CFG.waits.page));
    console.log("  URL:", page.url());

    const text = await page.evaluate(() => document.body ? document.body.innerText : "");
    const tLines = text.split("\n").map(l => l.trim()).filter(Boolean);

    const results = [];

    // Skip to "pet results"
    let i = 0;
    while (i < tLines.length) {
      if (tLines[i] === "pet results") { i++; break; }
      i++;
    }

    while (i < tLines.length && results.length < CFG.maxResults) {
      const line = tLines[i];

      if (MILES_RE.test(line)) {
        const name = i > 0 ? tLines[i - 1] : "Unknown";
        const ageGenderLine = i + 1 < tLines.length ? tLines[i + 1] : "";
        const breed = i + 2 < tLines.length ? tLines[i + 2] : "Unknown";

        const ag = ageGenderLine.match(AGE_GENDER_RE);
        const age = ag ? ag[1] : "Unknown";
        const gender = ag ? ag[2] : "Unknown";

        let shelter = "Unknown";
        for (let j = i + 3; j < Math.min(i + 20, tLines.length); j++) {
          if (tLines[j] === "Shelter") {
            shelter = j + 1 < tLines.length ? tLines[j + 1] : "Unknown";
            break;
          }
        }

        results.push({ name, breed, age, gender, shelter });
      }
      i++;
    }

    console.log("\n" + "=".repeat(60));
    console.log("Adoptable Dogs near " + CFG.location);
    console.log("=".repeat(60));
    for (let idx = 0; idx < results.length; idx++) {
      const r = results[idx];
      console.log("\n" + (idx + 1) + ". " + r.name);
      console.log("   Breed:   " + r.breed);
      console.log("   Age:     " + r.age);
      console.log("   Gender:  " + r.gender);
      console.log("   Shelter: " + r.shelter);
    }
    console.log("\nFound " + results.length + " pets");

    // Generate Python
    const pyCode = genPython(CFG, recorder);
    const pyPath = path.join(__dirname, "petfinder_search.py");
    fs.writeFileSync(pyPath, pyCode);
    console.log("Python script written to:", pyPath);

  } catch(e) {
    console.error("Error:", e.message);
  } finally {
    await stagehand.close();
  }
})();
