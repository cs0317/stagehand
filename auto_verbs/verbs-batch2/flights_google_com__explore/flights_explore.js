const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient, observeAndAct } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");
const os = require("os");

/**
 * Google Flights – Explore Cheap Destinations
 *
 * Uses AI-driven discovery to explore Google Flights map view,
 * then generates a pure-Playwright Python script.
 */

const CFG = {
  url: "https://www.google.com/travel/flights",
  departureCity: "Chicago",
  tripDays: 5,
  maxResults: 5,
  waits: { page: 3000, type: 2000, search: 5000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Google Flights – Explore Cheap Destinations
Departure: ${cfg.departureCity}, Trip: ${cfg.tripDays} days

Generated on: ${ts}
Recorded ${n} browser interactions

Uses Playwright via CDP connection with the user's Chrome profile.
"""

import re
import os, sys, shutil
from datetime import date, timedelta
from dateutil.relativedelta import relativedelta
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws


def run(
    playwright: Playwright,
    departure_city: str = "${cfg.departureCity}",
    trip_days: int = ${cfg.tripDays},
    max_results: int = ${cfg.maxResults},
) -> list:
    print(f"  Departure: {departure_city}")
    print(f"  Trip: {trip_days} days")
    print(f"  Max results: {max_results}\\n")

    # Calculate dates: next month, round-trip
    depart_date = date.today() + relativedelta(months=1)
    return_date = depart_date + timedelta(days=trip_days)

    port = get_free_port()
    profile_dir = get_temp_profile_dir("flights_google_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        # ── Navigate ──────────────────────────────────────────────────────
        print("Loading Google Flights Explore...")
        page.goto("${cfg.url}/explore")
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(3000)

        # ── STEP 1: Enter departure city ──────────────────────────────────
        print(f'STEP 1: Set departure city to "{departure_city}"...')
        dep_input = page.locator(
            'input[aria-label*="Where from" i], '
            'input[placeholder*="Where from" i], '
            'input[aria-label*="departure" i]'
        ).first
        dep_input.evaluate("el => el.click()")
        page.wait_for_timeout(500)
        page.keyboard.press("Control+a")
        dep_input.type(departure_city, delay=50)
        page.wait_for_timeout(2000)

        # Select first suggestion
        try:
            suggestion = page.locator(
                'li[role="option"], '
                '[data-testid="autocomplete-result"], '
                'ul[role="listbox"] li'
            ).first
            suggestion.wait_for(state="visible", timeout=3000)
            suggestion.evaluate("el => el.click()")
            print(f"  Selected: {departure_city}")
        except Exception:
            page.keyboard.press("Enter")
        page.wait_for_timeout(1000)

        # ── STEP 2: Set dates ─────────────────────────────────────────────
        print(f"STEP 2: Set travel dates...")
        # Google Flights explore may auto-populate dates; adjust if needed
        page.wait_for_timeout(2000)

        # ── STEP 3: Extract destinations ──────────────────────────────────
        print(f"STEP 3: Extract up to {max_results} cheap destinations...")
        page.wait_for_timeout(3000)

        dest_items = page.locator(
            '[class*="destination"], '
            '[data-testid*="destination"], '
            'div[class*="explore-destination"]'
        )
        count = dest_items.count()
        print(f"  Found {count} destination items")

        for i in range(min(count, max_results)):
            item = dest_items.nth(i)
            try:
                city = "N/A"
                price = "N/A"

                try:
                    city_el = item.locator('h3, [class*="city"], [class*="name"]').first
                    city = city_el.inner_text(timeout=2000).strip()
                except Exception:
                    pass

                try:
                    price_el = item.locator('[class*="price"], span:has-text("$")').first
                    price = price_el.inner_text(timeout=2000).strip()
                except Exception:
                    pass

                if city != "N/A":
                    results.append({"city": city, "price": price})
                    print(f"  {len(results)}. {city} | {price}")

            except Exception as e:
                print(f"  Error on item {i}: {e}")
                continue

        # ── Print results ─────────────────────────────────────────────────
        print(f"\\nFound {len(results)} cheap destinations from {departure_city}:")
        for i, r in enumerate(results, 1):
            print(f"  {i}. {r['city']} — {r['price']}")

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
        print(f"\\nTotal destinations found: {len(items)}")
`;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Google Flights – Explore Cheap Destinations");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const recorder = new PlaywrightRecorder();
  const llmClient = setupLLMClient("hybrid");
  let stagehand;

  try {
    stagehand = new Stagehand({
      env: "LOCAL", verbose: 0, llmClient,
      localBrowserLaunchOptions: {
        userDataDir: path.join(os.homedir(), "AppData", "Local", "Google", "Chrome", "User Data", "Default"),
        headless: false, viewport: { width: 1920, height: 1080 },
        args: ["--disable-blink-features=AutomationControlled", "--disable-infobars", "--disable-extensions", "--start-maximized", "--window-size=1920,1080"],
      },
    });
    await stagehand.init();
    const page = stagehand.context.pages()[0];

    recorder.goto(`${CFG.url}/explore`);
    await page.goto(`${CFG.url}/explore`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(CFG.waits.page);

    // Set departure
    await observeAndAct(stagehand, page, recorder, `Click the departure city input field`, "Click departure input");
    await page.waitForTimeout(500);
    await stagehand.act(`Clear the field and type '${CFG.departureCity}'`);
    recorder.record("act", { instruction: `Type departure city`, description: `Fill: ${CFG.departureCity}`, method: "type" });
    await page.waitForTimeout(CFG.waits.type);
    await stagehand.act("Select the first suggestion from the dropdown");
    await page.waitForTimeout(CFG.waits.search);

    // Extract destinations
    const { z } = require("zod/v3");
    const listings = await stagehand.extract(
      `Extract up to ${CFG.maxResults} cheap flight destinations from the explore map. For each get the city name and round-trip price.`,
      z.object({
        destinations: z.array(z.object({
          city: z.string().describe("Destination city name"),
          price: z.string().describe("Round-trip price, e.g. '$150'"),
        })).describe(`Up to ${CFG.maxResults} destinations`),
      })
    );
    recorder.record("extract", { instruction: "Extract destinations", description: `Extract up to ${CFG.maxResults} destinations`, results: listings });

    const pyScript = genPython(CFG, recorder);
    fs.writeFileSync(path.join(__dirname, "flights_explore.py"), pyScript, "utf-8");
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2), "utf-8");
    console.log("✅ Files saved");
    return listings;
  } catch (err) {
    console.error("❌ Error:", err.message);
    if (recorder?.actions.length > 0) {
      fs.writeFileSync(path.join(__dirname, "flights_explore.py"), genPython(CFG, recorder), "utf-8");
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
