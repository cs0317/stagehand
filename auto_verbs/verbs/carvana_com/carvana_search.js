/**
 * carvana_search.js – Stagehand explorer for Carvana
 *
 * Run:
 *   node verbs/carvana_com/carvana_search.js
 */

const { Stagehand } = require("@browserbasehq/stagehand");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");
const {
  PlaywrightRecorder,
  setupLLMClient,
} = require("../../stagehand-utils");

// ── Configurable parameters ──────────────────────────────────────────
const QUERY       = "Honda Civic";
const MAX_RESULTS = 5;

// ── Python generation ────────────────────────────────────────────────
function genPython() {
  return `\
"""
Auto-generated Playwright script (Python)
Carvana – Car Search
Query: ${QUERY}   Max results: ${MAX_RESULTS}

Generated on: ${new Date().toISOString()}
"""

import re
import os, sys, shutil
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws


def run(
    playwright: Playwright,
    query: str = "${QUERY}",
    max_results: int = ${MAX_RESULTS},
) -> list:
    print(f"  Query: {query}  Max results: {max_results}\\n")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("carvana_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        # ── Navigate ──────────────────────────────────────────────────
        print("Loading Carvana search results...")
        slug = query.lower().replace(" ", "-")
        search_url = f"https://www.carvana.com/cars/{slug}"
        page.goto(search_url)
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(5000)
        print(f"  Loaded: {page.url}")

        # ── Extract cars ──────────────────────────────────────────────
        print(f"Extracting up to {max_results} cars...")

        body_text = page.evaluate("document.body.innerText") or ""
        lines = [l.strip() for l in body_text.split("\\n") if l.strip()]

        # Pattern: "YEAR Make Model" → trim → "XXk miles" → "$XX,XXX" → "$XXX/mo"
        i = 0
        while i < len(lines) and len(results) < max_results:
            # Match year + make + model line
            m = re.match(r"^(\\d{4})\\s+(.+)$", lines[i])
            if m and int(m.group(1)) >= 2000 and int(m.group(1)) <= 2030:
                year_model = lines[i]
                trim = "N/A"
                mileage = "N/A"
                price = "N/A"
                monthly = "N/A"

                # Look ahead for trim, mileage, price, monthly
                for k in range(i + 1, min(i + 8, len(lines))):
                    line = lines[k]
                    if re.match(r"^\\d+k miles$", line):
                        mileage = line
                    elif re.match(r"^\\$[\\d,]+$", line) and price == "N/A":
                        price = line
                    elif re.match(r"^\\$[\\d,]+/mo$", line):
                        monthly = line
                    elif trim == "N/A" and k == i + 1 and not line.startswith("$") and "miles" not in line:
                        trim = line

                if price != "N/A":
                    results.append({
                        "year_model": year_model,
                        "trim": trim,
                        "mileage": mileage,
                        "price": price,
                        "monthly_payment": monthly,
                    })

            i += 1

        # ── Print results ─────────────────────────────────────────────
        print(f"\\nFound {len(results)} cars:\\n")
        for i, car in enumerate(results, 1):
            print(f"  {i}. {car['year_model']} — {car['trim']}")
            print(f"     Price: {car['price']}  Mileage: {car['mileage']}  Monthly: {car['monthly_payment']}")
            print()

    except Exception as e:
        import traceback
        print(f"Error: {e}")
        traceback.print_exc()
    finally:
        try:
            browser.close()
        except Exception:
            pass
        chrome_proc.terminate()
        shutil.rmtree(profile_dir, ignore_errors=True)

    return results


if __name__ == "__main__":
    with sync_playwright() as playwright:
        items = run(playwright)
        print(f"\\nTotal cars found: {len(items)}")
`;
}

// ── Main ─────────────────────────────────────────────────────────────
(async () => {
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  Carvana – Car Search");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  🚗 Query      : " + QUERY);
  console.log("  📊 Max results: " + MAX_RESULTS);

  const llmClient = setupLLMClient("hybrid");
  const stagehand = new Stagehand({ env: "LOCAL", verbose: 0, llmClient });
  await stagehand.init();

  const page = stagehand.context.pages()[0];
  const recorder = new PlaywrightRecorder();

  // ── Navigate to search results ────────────────────────────────────
  const slug = QUERY.toLowerCase().replace(/ /g, "-");
  const searchUrl = "https://www.carvana.com/cars/" + slug;
  console.log("\n🌐 Loading Carvana search results...");
  await page.goto(searchUrl);
  await page.waitForLoadState("networkidle");
  await new Promise((r) => setTimeout(r, 5000));
  recorder.record("goto", "Navigate to " + searchUrl, { url: searchUrl });
  console.log("✅ Loaded\n");

  // ── Extract with AI ───────────────────────────────────────────────
  const CarSchema = z.object({
    cars: z.array(
      z.object({
        year_model: z.string().describe("Year, make, and model (e.g. '2022 Honda Civic')"),
        trim: z.string().describe("Trim level (e.g. 'Sport Touring')"),
        price: z.string().describe("Price (e.g. '$27,590')"),
        mileage: z.string().describe("Mileage (e.g. '38k miles')"),
        monthly_payment: z.string().describe("Monthly payment estimate (e.g. '$507/mo')"),
      })
    ).max(MAX_RESULTS),
  });

  const data = await stagehand.extract(
    "Extract up to " + MAX_RESULTS + " car listings. For each car get the year/make/model, trim, price, mileage, and monthly payment estimate.",
    CarSchema
  );
  recorder.record("extract", "Extract up to " + MAX_RESULTS + " cars");

  console.log("📋 Found " + data.cars.length + " cars:");
  data.cars.forEach((c, i) => {
    console.log("   " + (i + 1) + ". " + c.year_model + " — " + c.trim);
    console.log("      Price: " + c.price + "  Mileage: " + c.mileage + "  Monthly: " + c.monthly_payment);
  });

  // ── Save Python & actions ─────────────────────────────────────────
  const pyPath = path.join(__dirname, "carvana_search.py");
  fs.writeFileSync(pyPath, genPython(), "utf-8");
  console.log("\n✅ Python: " + pyPath);

  const actionsPath = path.join(__dirname, "recorded_actions.json");
  fs.writeFileSync(actionsPath, JSON.stringify(recorder.actions, null, 2), "utf-8");
  console.log("📋 Actions: " + actionsPath);

  await stagehand.close();
  console.log("🎊 Done!");
})();
