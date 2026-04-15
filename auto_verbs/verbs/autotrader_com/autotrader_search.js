const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * AutoTrader.com – Used Car Search
 */

const CFG = {
  url: "https://www.autotrader.com",
  make: "Toyota",
  model: "Camry",
  zipCode: "60601",
  radiusMiles: 50,
  maxResults: 5,
  waits: { page: 3000, search: 5000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
AutoTrader.com – Used Car Search
Make: ${cfg.make}  Model: ${cfg.model}
ZIP: ${cfg.zipCode}  Radius: ${cfg.radiusMiles} miles
Max results: ${cfg.maxResults}

Generated on: ${ts}
Recorded ${n} browser interactions
"""

import re
import os, sys, shutil
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws


def run(
    playwright: Playwright,
    make: str = "${cfg.make}",
    model: str = "${cfg.model}",
    zip_code: str = "${cfg.zipCode}",
    radius_miles: int = ${cfg.radiusMiles},
    max_results: int = ${cfg.maxResults},
) -> list:
    print(f"  Make: {make}  Model: {model}")
    print(f"  ZIP: {zip_code}  Radius: {radius_miles} miles")
    print(f"  Max results: {max_results}\\n")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("autotrader_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        # ── Navigate to search results ────────────────────────────────────
        make_lower = make.lower()
        model_lower = model.lower()
        search_url = (
            f"${cfg.url}/cars-for-sale/used-cars/{make_lower}/{model_lower}"
            f"?zip={zip_code}&searchRadius={radius_miles}"
        )
        print(f"Loading {search_url}...")
        page.goto(search_url)
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(5000)
        print(f"  Loaded: {page.url}")

        # ── Extract listings ──────────────────────────────────────────────
        print(f"Extracting up to {max_results} listings...")

        # AutoTrader listing cards: div[data-cmp="inventoryListing"]
        listing_cards = page.locator('div[data-cmp="inventoryListing"]')
        count = listing_cards.count()
        print(f"  Found {count} listing cards on page")

        for i in range(min(count, max_results)):
            card = listing_cards.nth(i)
            try:
                text = card.inner_text(timeout=3000)

                # Year/Make/Model from img alt attribute
                year_make_model = "N/A"
                img = card.locator('img[data-cmp="inventoryImage"]').first
                alt = img.get_attribute("alt", timeout=2000) or ""
                # alt format: "Used 2025 Toyota Camry SE w/ Package"
                m = re.match(r"(?:Used|Certified|New)?\\s*(\\d{4}\\s+.+?)(?:\\s+w/|$)", alt)
                if m:
                    year_make_model = m.group(1).strip()
                else:
                    year_make_model = alt.replace("Used ", "").replace("Certified ", "").strip()

                # Price: number with commas (e.g. "27,904") before "See payment"
                price = "N/A"
                m = re.search(r"(\\d{1,3}(?:,\\d{3})+)\\s*\\n?\\s*(?:See payment|See estimated)", text)
                if m:
                    price = "$" + m.group(1)
                else:
                    # Fallback: look for 5+ digit number (prices are always 5+ digits)
                    m = re.search(r"(\\d{2,3},\\d{3})", text)
                    if m:
                        price = "$" + m.group(1)

                # Mileage: "64K mi" or "27,000 mi"
                mileage = "N/A"
                m = re.search(r"([\\d,]+K?)\\s*mi\\b", text)
                if m:
                    mileage = m.group(1) + " mi"

                # Dealer name: look for "Sponsored by DealerName" or line before "mi. away"
                dealer = "N/A"
                m = re.search(r"Sponsored by\\s+(.+?)\\n", text)
                if m:
                    dealer = m.group(1).strip()
                else:
                    lines = text.split("\\n")
                    for j, line in enumerate(lines):
                        if re.search(r"mi\\.?\\s*away", line):
                            # Dealer name is usually 1-2 lines before distance
                            for k in range(max(0, j - 3), j):
                                candidate = lines[k].strip()
                                if (candidate and len(candidate) > 3
                                    and not re.match(r"^[\\d\\$]", candidate)
                                    and "Request" not in candidate
                                    and "payment" not in candidate.lower()
                                    and "See " not in candidate
                                    and "Price" not in candidate
                                    and "Accidents" not in candidate):
                                    dealer = candidate
                            break

                if year_make_model == "N/A":
                    continue

                results.append({
                    "year_make_model": year_make_model,
                    "price": price,
                    "mileage": mileage,
                    "dealer": dealer,
                })
            except Exception:
                continue

        # ── Print results ─────────────────────────────────────────────────
        print(f"\\nFound {len(results)} listings for '{make} {model}' near {zip_code}:\\n")
        for i, car in enumerate(results, 1):
            print(f"  {i}. {car['year_make_model']}")
            print(f"     Price: {car['price']}  Mileage: {car['mileage']}")
            print(f"     Dealer: {car['dealer']}")
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
        print(f"\\nTotal listings found: {len(items)}")
`;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  AutoTrader.com – Used Car Search");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  🚗 ${CFG.make} ${CFG.model}  ZIP: ${CFG.zipCode}  Radius: ${CFG.radiusMiles} mi`);
  console.log(`  📊 Max results: ${CFG.maxResults}\n`);

  const recorder = new PlaywrightRecorder();
  const llmClient = setupLLMClient("hybrid");
  let stagehand;

  try {
    stagehand = new Stagehand({
      env: "LOCAL", verbose: 0, llmClient,
      localBrowserLaunchOptions: {
        headless: false,
        viewport: { width: 1920, height: 1080 },
        args: ["--disable-blink-features=AutomationControlled", "--start-maximized"],
      },
    });
    await stagehand.init();
    const page = stagehand.context.pages()[0];

    const makeLower = CFG.make.toLowerCase();
    const modelLower = CFG.model.toLowerCase();
    const searchUrl = `${CFG.url}/cars-for-sale/used-cars/${makeLower}/${modelLower}?zip=${CFG.zipCode}&searchRadius=${CFG.radiusMiles}`;
    console.log(`🌐 Loading ${searchUrl}...`);
    recorder.goto(searchUrl);
    await page.goto(searchUrl);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(CFG.waits.search);
    console.log("✅ Loaded\n");

    const { z } = require("zod/v3");
    const listings = await stagehand.extract(
      `Extract up to ${CFG.maxResults} used car listings. For each, get the year/make/model (e.g. "2025 Toyota Camry SE"), price, mileage, and dealer name. Skip sponsored/featured banners.`,
      z.object({
        cars: z.array(z.object({
          yearMakeModel: z.string().describe("Year make model trim, e.g. '2025 Toyota Camry SE'"),
          price: z.string().describe("Price, e.g. '$27,904'"),
          mileage: z.string().describe("Mileage, e.g. '64K mi'"),
          dealer: z.string().describe("Dealer name"),
        })).describe(`Up to ${CFG.maxResults} cars`),
      })
    );

    recorder.record("extract", {
      instruction: "Extract used car listings",
      description: `Extract up to ${CFG.maxResults} cars`,
      results: listings,
    });

    console.log(`📋 Found ${listings.cars.length} cars:`);
    listings.cars.forEach((c, i) => {
      console.log(`   ${i + 1}. ${c.yearMakeModel}`);
      console.log(`      Price: ${c.price}  Mileage: ${c.mileage}  Dealer: ${c.dealer}`);
    });

    const pyScript = genPython(CFG, recorder);
    const pyPath = path.join(__dirname, "autotrader_search.py");
    fs.writeFileSync(pyPath, pyScript, "utf-8");
    console.log(`\n✅ Python: ${pyPath}`);

    const jsonPath = path.join(__dirname, "recorded_actions.json");
    fs.writeFileSync(jsonPath, JSON.stringify(recorder.actions, null, 2), "utf-8");
    console.log(`📋 Actions: ${jsonPath}`);

    return listings;
  } catch (err) {
    console.error("\n❌ Error:", err.message);
    if (recorder?.actions.length > 0) {
      const pyScript = genPython(CFG, recorder);
      fs.writeFileSync(path.join(__dirname, "autotrader_search.py"), pyScript, "utf-8");
    }
    throw err;
  } finally {
    if (stagehand) await stagehand.close();
  }
}

if (require.main === module) {
  main().then(() => { console.log("🎊 Done!"); process.exit(0); }).catch((e) => { console.error("💥", e.message); process.exit(1); });
}
module.exports = { main };
