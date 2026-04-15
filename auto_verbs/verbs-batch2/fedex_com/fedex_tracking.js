const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient, observeAndAct } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");
const os = require("os");

/**
 * FedEx.com – Package Tracking
 *
 * Uses AI-driven discovery to track a package on FedEx,
 * then generates a pure-Playwright Python script.
 */

const CFG = {
  url: "https://www.fedex.com",
  trackingNumber: "123456789012",
  waits: { page: 3000, type: 2000, search: 5000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
FedEx.com – Package Tracking
Tracking: ${cfg.trackingNumber}

Generated on: ${ts}
Recorded ${n} browser interactions

Uses Playwright via CDP connection with the user's Chrome profile.
"""

import re
import os, sys, shutil
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws


def run(
    playwright: Playwright,
    tracking_number: str = "${cfg.trackingNumber}",
) -> dict:
    print(f"  Tracking number: {tracking_number}\\n")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("fedex_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    result = {}

    try:
        # ── Navigate ──────────────────────────────────────────────────────
        print("Loading FedEx.com tracking page...")
        page.goto("${cfg.url}/fedextrack")
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(3000)

        # ── Dismiss popups / cookie banners ───────────────────────────────
        for selector in [
            "button#onetrust-accept-btn-handler",
            "button:has-text('Accept')",
            "button:has-text('Got it')",
            "button:has-text('Close')",
        ]:
            try:
                btn = page.locator(selector).first
                if btn.is_visible(timeout=1500):
                    btn.evaluate("el => el.click()")
                    page.wait_for_timeout(500)
            except Exception:
                pass

        # ── STEP 1: Enter tracking number ─────────────────────────────────
        print(f'STEP 1: Enter tracking number "{tracking_number}"...')
        tracking_input = page.locator(
            'input[name="trackingnumber"], '
            'input[id*="tracking" i], '
            'input[aria-label*="tracking" i], '
            'input[placeholder*="tracking" i], '
            'textarea[name*="tracking" i]'
        ).first
        tracking_input.evaluate("el => el.click()")
        page.wait_for_timeout(500)
        page.keyboard.press("Control+a")
        tracking_input.type(tracking_number, delay=50)
        page.wait_for_timeout(1000)
        page.keyboard.press("Enter")
        print(f'  Entered "{tracking_number}" and pressed Enter')
        page.wait_for_timeout(5000)

        # ── STEP 2: Extract tracking info ─────────────────────────────────
        print("STEP 2: Extract tracking details...")

        # Status
        try:
            status_el = page.locator(
                '[class*="shipment-status"], '
                '[class*="tracking-status"], '
                '[data-testid*="status"], '
                'h2[class*="status"]'
            ).first
            result["status"] = status_el.inner_text(timeout=5000).strip()
        except Exception:
            result["status"] = "N/A"

        # Last location
        try:
            location_el = page.locator(
                '[class*="location"], '
                '[class*="origin"], '
                '[data-testid*="location"]'
            ).first
            result["last_location"] = location_el.inner_text(timeout=3000).strip()
        except Exception:
            result["last_location"] = "N/A"

        # Estimated delivery
        try:
            delivery_el = page.locator(
                '[class*="delivery-date"], '
                '[class*="estimated"], '
                '[data-testid*="delivery"]'
            ).first
            result["estimated_delivery"] = delivery_el.inner_text(timeout=3000).strip()
        except Exception:
            result["estimated_delivery"] = "N/A"

        # ── Print results ─────────────────────────────────────────────────
        print(f"\\nTracking results for '{tracking_number}':")
        print(f"  Status: {result.get('status', 'N/A')}")
        print(f"  Last location: {result.get('last_location', 'N/A')}")
        print(f"  Estimated delivery: {result.get('estimated_delivery', 'N/A')}")

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

    return result


if __name__ == "__main__":
    with sync_playwright() as playwright:
        info = run(playwright)
        print(f"\\nTracking complete: {info}")
`;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  FedEx.com – Package Tracking");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const recorder = new PlaywrightRecorder();
  const llmClient = setupLLMClient("hybrid");
  let stagehand;

  try {
    stagehand = new Stagehand({
      env: "LOCAL",
      verbose: 0,
      llmClient,
      localBrowserLaunchOptions: {
        userDataDir: path.join(os.homedir(), "AppData", "Local", "Google", "Chrome", "User Data", "Default"),
        headless: false,
        viewport: { width: 1920, height: 1080 },
        args: ["--disable-blink-features=AutomationControlled", "--disable-infobars", "--disable-extensions", "--start-maximized", "--window-size=1920,1080"],
      },
    });
    await stagehand.init();

    const page = stagehand.context.pages()[0];

    recorder.goto(`${CFG.url}/fedextrack`);
    await page.goto(`${CFG.url}/fedextrack`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(CFG.waits.page);

    // Enter tracking number
    await observeAndAct(stagehand, page, recorder,
      `Click the tracking number input field`,
      "Click tracking input"
    );
    await page.waitForTimeout(500);
    await stagehand.act(`Clear the field and type '${CFG.trackingNumber}'`);
    recorder.record("act", { instruction: `Type tracking number`, description: `Fill: ${CFG.trackingNumber}`, method: "type" });
    await page.waitForTimeout(CFG.waits.type);
    await stagehand.act("Press Enter or click Track button to submit");
    recorder.record("act", { instruction: "Submit tracking", description: "Press Enter/Track", method: "press" });
    await page.waitForTimeout(CFG.waits.search);

    // Extract
    const { z } = require("zod/v3");
    const info = await stagehand.extract(
      `Extract the tracking status, last known location, and estimated delivery date for this package.`,
      z.object({
        status: z.string().describe("Current tracking status"),
        lastLocation: z.string().describe("Last known location"),
        estimatedDelivery: z.string().describe("Estimated delivery date"),
      })
    );
    recorder.record("extract", { instruction: "Extract tracking info", description: "Tracking details", results: info });
    console.log("📋 Tracking info:", info);

    const pyScript = genPython(CFG, recorder);
    fs.writeFileSync(path.join(__dirname, "fedex_tracking.py"), pyScript, "utf-8");
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2), "utf-8");
    console.log("✅ Files saved");

    return info;
  } catch (err) {
    console.error("❌ Error:", err.message);
    if (recorder?.actions.length > 0) {
      fs.writeFileSync(path.join(__dirname, "fedex_tracking.py"), genPython(CFG, recorder), "utf-8");
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
