const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient, observeAndAct } = require("../../stagehand-utils");
const fs = require("fs"); const path = require("path"); const os = require("os");

const CFG = { url: "https://www.traderjoes.com/home/store-locator", location: "Portland, OR", maxResults: 3, waits: { page: 3000, type: 2000, search: 5000 } };

function genPython(cfg, recorder) { const ts = new Date().toISOString();
  return `"""Auto-generated – Trader Joe's Store Locator. Location: ${cfg.location}. Generated: ${ts}"""
import re, os, sys, shutil
from playwright.sync_api import Playwright, sync_playwright
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws

def run(playwright: Playwright, location: str = "${cfg.location}", max_results: int = ${cfg.maxResults}) -> list:
    print(f"  Location: {location}\\n")
    port = get_free_port(); profile_dir = get_temp_profile_dir("traderjoes_com")
    chrome_proc = launch_chrome(profile_dir, port); ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]; page = context.pages[0] if context.pages else context.new_page()
    results = []
    try:
        page.goto("${cfg.url}"); page.wait_for_load_state("domcontentloaded"); page.wait_for_timeout(2000)
        for sel in ["button#onetrust-accept-btn-handler", "button:has-text('Accept')", "button:has-text('Close')"]:
            try:
                btn = page.locator(sel).first
                if btn.is_visible(timeout=1500): btn.evaluate("el => el.click()"); page.wait_for_timeout(500)
            except Exception: pass
        si = page.locator('input[id*="search"], input[placeholder*="city" i], input[placeholder*="zip" i], input[aria-label*="search" i]').first
        si.evaluate("el => el.click()"); page.wait_for_timeout(500)
        page.keyboard.press("Control+a"); si.type(location, delay=50); page.wait_for_timeout(1000); page.keyboard.press("Enter")
        page.wait_for_timeout(3000); page.wait_for_load_state("domcontentloaded"); page.wait_for_timeout(2000)
        cards = page.locator('[class*="StoreCard"], [class*="store-card"], li[class*="store"], article[class*="store"]')
        count = cards.count()
        for i in range(min(count, max_results)):
            card = cards.nth(i); address = hours = "N/A"
            try: address = card.locator('address, [class*="address"], p[class*="location"]').first.inner_text(timeout=2000).strip()
            except Exception: pass
            try: hours = card.locator('[class*="hours"], [class*="time"], span:has-text("am"), span:has-text("pm")').first.inner_text(timeout=2000).strip()
            except Exception: pass
            if address != "N/A": results.append({"address": address, "hours": hours}); print(f"  {len(results)}. {address} | {hours}")
        print(f"\\nFound {len(results)} stores:")
        for i, r in enumerate(results, 1): print(f"  {i}. {r['address']}\\n     {r['hours']}")
    except Exception as e: import traceback; print(f"Error: {e}"); traceback.print_exc()
    finally:
        try: browser.close()
        except Exception: pass
        chrome_proc.terminate(); shutil.rmtree(profile_dir, ignore_errors=True)
    return results

if __name__ == "__main__":
    with sync_playwright() as playwright: run(playwright)
`; }

async function main() { const recorder = new PlaywrightRecorder(); const llmClient = setupLLMClient("hybrid"); let stagehand;
  try { stagehand = new Stagehand({ env: "LOCAL", verbose: 0, llmClient, localBrowserLaunchOptions: { userDataDir: path.join(os.homedir(), "AppData", "Local", "Google", "Chrome", "User Data", "Default"), headless: false, viewport: { width: 1920, height: 1080 }, args: ["--disable-blink-features=AutomationControlled", "--disable-infobars", "--disable-extensions", "--start-maximized"] } });
    await stagehand.init(); const page = stagehand.context.pages()[0];
    await page.goto(CFG.url); await page.waitForLoadState("domcontentloaded"); await page.waitForTimeout(CFG.waits.page);
    await observeAndAct(stagehand, page, recorder, "Click the location search input", "Search");
    await stagehand.act(`Type '${CFG.location}' and press Enter`); await page.waitForTimeout(CFG.waits.search);
    const { z } = require("zod/v3");
    const listings = await stagehand.extract(`Extract up to ${CFG.maxResults} stores with address and hours.`, z.object({ stores: z.array(z.object({ address: z.string(), hours: z.string() })) }));
    recorder.record("extract", { instruction: "Extract stores", results: listings });
    fs.writeFileSync(path.join(__dirname, "traderjoes_stores.py"), genPython(CFG, recorder), "utf-8");
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2), "utf-8");
    return listings;
  } catch (err) { console.error("❌", err.message); throw err; } finally { if (stagehand) await stagehand.close(); } }
if (require.main === module) { main().then(() => process.exit(0)).catch(() => process.exit(1)); }
module.exports = { main };
