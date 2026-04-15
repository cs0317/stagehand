const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient, observeAndAct } = require("../../stagehand-utils");
const fs = require("fs"); const path = require("path"); const os = require("os");

const CFG = { url: "https://www.ups.com/track", trackingNumber: "1Z999AA10123456784", waits: { page: 3000, type: 2000, search: 5000 } };

function genPython(cfg, recorder) { const ts = new Date().toISOString();
  return `"""Auto-generated – UPS Package Tracking. Tracking: ${cfg.trackingNumber}. Generated: ${ts}"""
import re, os, sys, shutil
from playwright.sync_api import Playwright, sync_playwright
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws

def run(playwright: Playwright, tracking_number: str = "${cfg.trackingNumber}") -> dict:
    print(f"  Tracking number: {tracking_number}\\n")
    port = get_free_port(); profile_dir = get_temp_profile_dir("ups_com")
    chrome_proc = launch_chrome(profile_dir, port); ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]; page = context.pages[0] if context.pages else context.new_page()
    result = {}
    try:
        page.goto("${cfg.url}"); page.wait_for_load_state("domcontentloaded"); page.wait_for_timeout(3000)
        for sel in ["button#onetrust-accept-btn-handler", "button:has-text('Accept')", "button:has-text('Close')"]:
            try:
                btn = page.locator(sel).first
                if btn.is_visible(timeout=1500): btn.evaluate("el => el.click()"); page.wait_for_timeout(500)
            except Exception: pass
        si = page.locator('input[id*="tracking"], textarea[id*="tracking"], input[name*="track"], input[aria-label*="tracking" i]').first
        si.evaluate("el => el.click()"); page.wait_for_timeout(500)
        page.keyboard.press("Control+a"); si.type(tracking_number, delay=50); page.wait_for_timeout(1000)
        track_btn = page.locator('button:has-text("Track"), button[id*="track"], input[type="submit"]').first
        track_btn.click(); page.wait_for_timeout(3000); page.wait_for_load_state("domcontentloaded"); page.wait_for_timeout(2000)

        try: result["status"] = page.locator('[class*="status"], [data-test*="status"], span:has-text("Delivered"), span:has-text("In Transit")').first.inner_text(timeout=3000).strip()
        except Exception: result["status"] = "N/A"
        try: result["location"] = page.locator('[class*="location"], [data-test*="location"]').first.inner_text(timeout=3000).strip()
        except Exception: result["location"] = "N/A"
        try: result["delivery_date"] = page.locator('[class*="delivery"], [data-test*="delivery"], span:has-text("Delivery")').first.inner_text(timeout=3000).strip()
        except Exception: result["delivery_date"] = "N/A"

        print(f"Tracking: {tracking_number}")
        print(f"  Status:        {result.get('status', 'N/A')}")
        print(f"  Location:      {result.get('location', 'N/A')}")
        print(f"  Delivery Date: {result.get('delivery_date', 'N/A')}")
    except Exception as e: import traceback; print(f"Error: {e}"); traceback.print_exc()
    finally:
        try: browser.close()
        except Exception: pass
        chrome_proc.terminate(); shutil.rmtree(profile_dir, ignore_errors=True)
    return result

if __name__ == "__main__":
    with sync_playwright() as playwright: run(playwright)
`; }

async function main() { const recorder = new PlaywrightRecorder(); const llmClient = setupLLMClient("hybrid"); let stagehand;
  try { stagehand = new Stagehand({ env: "LOCAL", verbose: 0, llmClient, localBrowserLaunchOptions: { userDataDir: path.join(os.homedir(), "AppData", "Local", "Google", "Chrome", "User Data", "Default"), headless: false, viewport: { width: 1920, height: 1080 }, args: ["--disable-blink-features=AutomationControlled", "--disable-infobars", "--disable-extensions", "--start-maximized"] } });
    await stagehand.init(); const page = stagehand.context.pages()[0];
    await page.goto(CFG.url); await page.waitForLoadState("domcontentloaded"); await page.waitForTimeout(CFG.waits.page);
    await observeAndAct(stagehand, page, recorder, "Click tracking number input", "Track");
    await stagehand.act(`Type '${CFG.trackingNumber}' into the tracking field`); await page.waitForTimeout(CFG.waits.type);
    await observeAndAct(stagehand, page, recorder, "Click Track button", "Submit");
    await page.waitForTimeout(CFG.waits.search);
    const { z } = require("zod/v3");
    const data = await stagehand.extract(`Extract tracking info: status, last location, and estimated delivery date.`, z.object({ status: z.string(), location: z.string(), deliveryDate: z.string() }));
    recorder.record("extract", { instruction: "Extract tracking info", results: data });
    fs.writeFileSync(path.join(__dirname, "ups_tracking.py"), genPython(CFG, recorder), "utf-8");
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2), "utf-8");
    return data;
  } catch (err) { console.error("❌", err.message); throw err; } finally { if (stagehand) await stagehand.close(); } }
if (require.main === module) { main().then(() => process.exit(0)).catch(() => process.exit(1)); }
module.exports = { main };
