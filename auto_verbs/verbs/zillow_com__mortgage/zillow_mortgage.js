const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient, observeAndAct } = require("../../stagehand-utils");
const fs = require("fs"); const path = require("path"); const os = require("os");

const CFG = { url: "https://www.zillow.com/mortgage-calculator/", homePrice: "500000", downPaymentPct: "20", waits: { page: 3000, type: 2000, calc: 5000 } };

function genPython(cfg, recorder) { const ts = new Date().toISOString();
  return `"""Auto-generated – Zillow Mortgage Calculator. Home Price: $${cfg.homePrice}, Down: ${cfg.downPaymentPct}%. Generated: ${ts}"""
import re, os, sys, shutil
from playwright.sync_api import Playwright, sync_playwright
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws

def run(playwright: Playwright, home_price: str = "${cfg.homePrice}", down_payment_pct: str = "${cfg.downPaymentPct}") -> dict:
    print(f"  Home Price: ${cfg.homePrice}, Down Payment: ${cfg.downPaymentPct}%\\n")
    port = get_free_port(); profile_dir = get_temp_profile_dir("zillow_com")
    chrome_proc = launch_chrome(profile_dir, port); ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]; page = context.pages[0] if context.pages else context.new_page()
    result = {}
    try:
        page.goto("${cfg.url}"); page.wait_for_load_state("domcontentloaded"); page.wait_for_timeout(3000)
        for sel in ["button#onetrust-accept-btn-handler", "button:has-text('Accept')", "button:has-text('Close')", "button[aria-label*='close' i]"]:
            try:
                btn = page.locator(sel).first
                if btn.is_visible(timeout=1500): btn.evaluate("el => el.click()"); page.wait_for_timeout(500)
            except Exception: pass
        # Enter home price
        try:
            price_input = page.locator('input[id*="price"], input[aria-label*="Home price" i], input[name*="price"]').first
            price_input.evaluate("el => el.click()"); page.wait_for_timeout(300)
            page.keyboard.press("Control+a"); price_input.type(home_price, delay=30); page.wait_for_timeout(500)
        except Exception: pass
        # Enter down payment
        try:
            dp_input = page.locator('input[id*="down"], input[aria-label*="Down payment" i], input[name*="down"]').first
            dp_input.evaluate("el => el.click()"); page.wait_for_timeout(300)
            page.keyboard.press("Control+a")
            down_amount = str(int(int(home_price) * int(down_payment_pct) / 100))
            dp_input.type(down_amount, delay=30); page.wait_for_timeout(500)
        except Exception: pass
        page.keyboard.press("Tab"); page.wait_for_timeout(3000)
        # Extract monthly payment
        try:
            mp_el = page.locator('[class*="monthly-payment"], [data-testid*="monthly"], [class*="payment-amount"], h3:has-text("$"), span[class*="total"]').first
            result["monthly_payment"] = mp_el.inner_text(timeout=3000).strip()
        except Exception: result["monthly_payment"] = "N/A"
        # Extract principal & interest
        try:
            pi_el = page.locator('[class*="principal"], td:has-text("Principal"), li:has-text("Principal"), div:has-text("Principal & interest")')
            text = pi_el.first.inner_text(timeout=3000).strip()
            m = re.search(r"\\\\$[\\\\d,\\\\.]+", text)
            result["principal_interest"] = m.group(0) if m else text
        except Exception: result["principal_interest"] = "N/A"
        # Extract property tax
        try:
            tax_el = page.locator('[class*="tax"], td:has-text("Property tax"), li:has-text("Property tax"), div:has-text("Property tax")')
            text = tax_el.first.inner_text(timeout=3000).strip()
            m = re.search(r"\\\\$[\\\\d,\\\\.]+", text)
            result["property_tax"] = m.group(0) if m else text
        except Exception: result["property_tax"] = "N/A"
        # Extract insurance
        try:
            ins_el = page.locator('[class*="insurance"], td:has-text("insurance"), li:has-text("insurance"), div:has-text("Homeowners insurance")')
            text = ins_el.first.inner_text(timeout=3000).strip()
            m = re.search(r"\\\\$[\\\\d,\\\\.]+", text)
            result["insurance"] = m.group(0) if m else text
        except Exception: result["insurance"] = "N/A"
        print(f"Mortgage Estimate:")
        print(f"  Monthly Payment:     {result.get('monthly_payment', 'N/A')}")
        print(f"  Principal & Interest: {result.get('principal_interest', 'N/A')}")
        print(f"  Property Tax:        {result.get('property_tax', 'N/A')}")
        print(f"  Insurance:           {result.get('insurance', 'N/A')}")
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
    await observeAndAct(stagehand, page, recorder, "Click the home price input field", "Home Price Input");
    await stagehand.act(`Clear the home price field and type '${CFG.homePrice}'`); await page.waitForTimeout(CFG.waits.type);
    await observeAndAct(stagehand, page, recorder, "Click the down payment input field", "Down Payment Input");
    const downAmount = String(Math.round(parseInt(CFG.homePrice) * parseInt(CFG.downPaymentPct) / 100));
    await stagehand.act(`Clear the down payment field and type '${downAmount}'`); await page.waitForTimeout(CFG.waits.type);
    await page.keyboard.press("Tab"); await page.waitForTimeout(CFG.waits.calc);
    const { z } = require("zod/v3");
    const info = await stagehand.extract(`Extract the mortgage calculation results: estimated monthly payment, principal and interest amount, property tax amount, and homeowners insurance amount.`, z.object({ monthly_payment: z.string(), principal_interest: z.string(), property_tax: z.string(), insurance: z.string() }));
    recorder.record("extract", { instruction: "Extract mortgage details", results: info });
    fs.writeFileSync(path.join(__dirname, "zillow_mortgage.py"), genPython(CFG, recorder), "utf-8");
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2), "utf-8");
    return info;
  } catch (err) { console.error("❌", err.message); throw err; } finally { if (stagehand) await stagehand.close(); } }
if (require.main === module) { main().then(() => process.exit(0)).catch(() => process.exit(1)); }
module.exports = { main };
