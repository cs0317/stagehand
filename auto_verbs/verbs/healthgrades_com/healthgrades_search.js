const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient, observeAndAct } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");
const os = require("os");

const CFG = { url: "https://www.healthgrades.com", specialty: "dentist", location: "Chicago, IL", maxResults: 5, waits: { page: 3000, type: 2000, search: 5000 } };

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  return `"""
Auto-generated Playwright script (Python)
Healthgrades – Doctor Search
Specialty: ${cfg.specialty}, Location: ${cfg.location}
Generated on: ${ts}
"""

import re
import os, sys, shutil
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws


def run(
    playwright: Playwright,
    specialty: str = "${cfg.specialty}",
    location: str = "${cfg.location}",
    max_results: int = ${cfg.maxResults},
) -> list:
    print(f"  Specialty: {specialty}")
    print(f"  Location: {location}")
    print(f"  Max results: {max_results}\\n")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("healthgrades_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        print("Loading Healthgrades...")
        page.goto("${cfg.url}")
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(2000)

        for selector in ["button#onetrust-accept-btn-handler", "button:has-text('Accept')", "button:has-text('Close')"]:
            try:
                btn = page.locator(selector).first
                if btn.is_visible(timeout=1500): btn.evaluate("el => el.click()"); page.wait_for_timeout(500)
            except Exception: pass

        print(f'STEP 1: Search for "{specialty}" near "{location}"...')
        spec_input = page.locator('input[data-testid="search-term"], input[aria-label*="condition" i], input[placeholder*="condition" i], input[name="what"]').first
        spec_input.evaluate("el => el.click()")
        page.wait_for_timeout(500)
        page.keyboard.press("Control+a")
        spec_input.type(specialty, delay=50)
        page.wait_for_timeout(1000)

        loc_input = page.locator('input[data-testid="search-location"], input[aria-label*="location" i], input[placeholder*="location" i], input[name="where"]').first
        loc_input.evaluate("el => el.click()")
        page.wait_for_timeout(500)
        page.keyboard.press("Control+a")
        loc_input.type(location, delay=50)
        page.wait_for_timeout(1000)
        page.keyboard.press("Enter")
        page.wait_for_timeout(2000)
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(2000)

        print(f"STEP 2: Extract up to {max_results} doctors...")
        doctor_cards = page.locator('[data-testid="provider-card"], div[class*="provider-card"], div[class*="doctor-card"]')
        count = doctor_cards.count()
        print(f"  Found {count} doctor cards")

        for i in range(min(count, max_results)):
            card = doctor_cards.nth(i)
            try:
                name = "N/A"; rating = "N/A"; spec = "N/A"
                try:
                    name_el = card.locator('a[data-testid="provider-name"], h2, h3, [class*="name"]').first
                    name = name_el.inner_text(timeout=2000).strip()
                except Exception: pass
                try:
                    rating_el = card.locator('[class*="rating"], [data-testid*="rating"]').first
                    rating = rating_el.inner_text(timeout=2000).strip()
                except Exception: pass
                try:
                    spec_el = card.locator('[class*="specialty"], [data-testid*="specialty"]').first
                    spec = spec_el.inner_text(timeout=2000).strip()
                except Exception: pass

                if name != "N/A":
                    results.append({"name": name, "rating": rating, "specialty": spec})
                    print(f"  {len(results)}. {name} | Rating: {rating} | {spec}")
            except Exception as e:
                print(f"  Error on card {i}: {e}")

        print(f"\\nFound {len(results)} doctors for '{specialty}' near '{location}':")
        for i, r in enumerate(results, 1):
            print(f"  {i}. {r['name']}")
            print(f"     Rating: {r['rating']}  Specialty: {r['specialty']}")

    except Exception as e:
        import traceback; print(f"Error: {e}"); traceback.print_exc()
    finally:
        try: browser.close()
        except Exception: pass
        chrome_proc.terminate(); shutil.rmtree(profile_dir, ignore_errors=True)
    return results


if __name__ == "__main__":
    with sync_playwright() as playwright:
        items = run(playwright)
        print(f"\\nTotal doctors found: {len(items)}")
`;
}

async function main() {
  const recorder = new PlaywrightRecorder(); const llmClient = setupLLMClient("hybrid"); let stagehand;
  try {
    stagehand = new Stagehand({ env: "LOCAL", verbose: 0, llmClient, localBrowserLaunchOptions: { userDataDir: path.join(os.homedir(), "AppData", "Local", "Google", "Chrome", "User Data", "Default"), headless: false, viewport: { width: 1920, height: 1080 }, args: ["--disable-blink-features=AutomationControlled", "--disable-infobars", "--disable-extensions", "--start-maximized"] } });
    await stagehand.init(); const page = stagehand.context.pages()[0];
    await page.goto(CFG.url); await page.waitForLoadState("domcontentloaded"); await page.waitForTimeout(CFG.waits.page);
    await observeAndAct(stagehand, page, recorder, `Type '${CFG.specialty}' into the specialty search field`, "Search specialty");
    await stagehand.act(`Type '${CFG.location}' into the location field`);
    await stagehand.act("Press Enter or click Search");
    await page.waitForTimeout(CFG.waits.search);
    const { z } = require("zod/v3");
    const listings = await stagehand.extract(`Extract up to ${CFG.maxResults} doctors. Get name, rating, and specialty.`,
      z.object({ doctors: z.array(z.object({ name: z.string(), rating: z.string(), specialty: z.string() })) }));
    recorder.record("extract", { instruction: "Extract doctors", results: listings });
    fs.writeFileSync(path.join(__dirname, "healthgrades_search.py"), genPython(CFG, recorder), "utf-8");
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2), "utf-8");
    return listings;
  } catch (err) { console.error("❌", err.message); throw err;
  } finally { if (stagehand) await stagehand.close(); }
}
if (require.main === module) { main().then(() => process.exit(0)).catch(() => process.exit(1)); }
module.exports = { main };
