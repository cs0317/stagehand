const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient, observeAndAct } = require("../../stagehand-utils");
const fs = require("fs"); const path = require("path"); const os = require("os");

/**
 * Mayo Clinic – Condition Lookup
 * Search for a medical condition and extract overview, symptoms, causes.
 */

const CFG = {
  url: "https://www.mayoclinic.org",
  condition: "diabetes",
  waits: { page: 3000, type: 2000, search: 5000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  return `"""Auto-generated – Mayo Clinic Condition Lookup. Condition: ${cfg.condition}. Generated: ${ts}"""
import re, os, sys, shutil
from playwright.sync_api import Playwright, sync_playwright
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws

def run(playwright: Playwright, condition: str = "${cfg.condition}") -> dict:
    print(f"  Condition: {condition}\\n")
    port = get_free_port(); profile_dir = get_temp_profile_dir("mayoclinic_org")
    chrome_proc = launch_chrome(profile_dir, port); ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]; page = context.pages[0] if context.pages else context.new_page()
    result = {}
    try:
        page.goto("${cfg.url}"); page.wait_for_load_state("domcontentloaded"); page.wait_for_timeout(2000)
        for sel in ["button#onetrust-accept-btn-handler", "button:has-text('Accept')", "button:has-text('Close')"]:
            try:
                btn = page.locator(sel).first
                if btn.is_visible(timeout=1500): btn.evaluate("el => el.click()"); page.wait_for_timeout(500)
            except Exception: pass
        si = page.locator('input#searchfield, input[name="search"], input[aria-label*="search" i], input[type="search"]').first
        si.evaluate("el => el.click()"); page.wait_for_timeout(500)
        page.keyboard.press("Control+a"); si.type(condition, delay=50); page.wait_for_timeout(1000); page.keyboard.press("Enter")
        page.wait_for_timeout(2000); page.wait_for_load_state("domcontentloaded"); page.wait_for_timeout(2000)

        # Click first result
        first_link = page.locator('a[href*="/diseases-conditions/"], ol.results a, div.results a').first
        first_link.click(); page.wait_for_timeout(2000); page.wait_for_load_state("domcontentloaded"); page.wait_for_timeout(2000)

        # Extract overview
        try:
            overview = page.locator('div#definition, article p, div[class*="content"] p').first.inner_text(timeout=3000).strip()
            result["overview"] = overview[:500]
        except Exception: result["overview"] = "N/A"

        # Extract symptoms
        try:
            symp_section = page.locator('div#symptoms, h2:has-text("Symptoms") + *, [id*="symptoms"]')
            result["symptoms"] = symp_section.first.inner_text(timeout=3000).strip()[:500]
        except Exception: result["symptoms"] = "N/A"

        # Extract causes
        try:
            cause_section = page.locator('div#causes, h2:has-text("Causes") + *, [id*="causes"]')
            result["causes"] = cause_section.first.inner_text(timeout=3000).strip()[:500]
        except Exception: result["causes"] = "N/A"

        print(f"Condition: {condition}")
        print(f"  Overview:  {result.get('overview', 'N/A')[:200]}...")
        print(f"  Symptoms:  {result.get('symptoms', 'N/A')[:200]}...")
        print(f"  Causes:    {result.get('causes', 'N/A')[:200]}...")
    except Exception as e: import traceback; print(f"Error: {e}"); traceback.print_exc()
    finally:
        try: browser.close()
        except Exception: pass
        chrome_proc.terminate(); shutil.rmtree(profile_dir, ignore_errors=True)
    return result

if __name__ == "__main__":
    with sync_playwright() as playwright: run(playwright)
`;
}

async function main() {
  const recorder = new PlaywrightRecorder(); const llmClient = setupLLMClient("hybrid"); let stagehand;
  try {
    stagehand = new Stagehand({ env: "LOCAL", verbose: 0, llmClient, localBrowserLaunchOptions: { userDataDir: path.join(os.homedir(), "AppData", "Local", "Google", "Chrome", "User Data", "Default"), headless: false, viewport: { width: 1920, height: 1080 }, args: ["--disable-blink-features=AutomationControlled", "--disable-infobars", "--disable-extensions", "--start-maximized"] } });
    await stagehand.init(); const page = stagehand.context.pages()[0];
    await page.goto(CFG.url); await page.waitForLoadState("domcontentloaded"); await page.waitForTimeout(CFG.waits.page);
    await observeAndAct(stagehand, page, recorder, "Click search input", "Search");
    await stagehand.act(`Type '${CFG.condition}' and press Enter`); await page.waitForTimeout(CFG.waits.search);
    await observeAndAct(stagehand, page, recorder, "Click the first search result about the condition", "Navigate to condition page");
    await page.waitForTimeout(CFG.waits.page);

    const { z } = require("zod/v3");
    const data = await stagehand.extract(
      `Extract the condition information: overview/definition, symptoms, and causes.`,
      z.object({ overview: z.string(), symptoms: z.string(), causes: z.string() })
    );
    recorder.record("extract", { instruction: "Extract condition info", results: data });
    console.log("📋 Condition data:", data);

    fs.writeFileSync(path.join(__dirname, "mayoclinic_condition.py"), genPython(CFG, recorder), "utf-8");
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2), "utf-8");
    return data;
  } catch (err) { console.error("❌", err.message); throw err; } finally { if (stagehand) await stagehand.close(); }
}
if (require.main === module) { main().then(() => process.exit(0)).catch(() => process.exit(1)); }
module.exports = { main };
