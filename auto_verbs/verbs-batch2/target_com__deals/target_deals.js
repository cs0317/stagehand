const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient, observeAndAct } = require("../../stagehand-utils");
const fs = require("fs"); const path = require("path"); const os = require("os");

const CFG = { url: "https://www.target.com/circle/deals", section: "Top Deals", maxResults: 5, waits: { page: 3000, type: 2000, search: 5000 } };

function genPython(cfg, recorder) { const ts = new Date().toISOString();
  return `"""Auto-generated – Target Weekly Deals. Generated: ${ts}"""
import re, os, sys, shutil
from playwright.sync_api import Playwright, sync_playwright
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws

def run(playwright: Playwright, section: str = "${cfg.section}", max_results: int = ${cfg.maxResults}) -> list:
    print(f"  Section: {section}\\n")
    port = get_free_port(); profile_dir = get_temp_profile_dir("target_com__deals")
    chrome_proc = launch_chrome(profile_dir, port); ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]; page = context.pages[0] if context.pages else context.new_page()
    results = []
    try:
        page.goto("${cfg.url}"); page.wait_for_load_state("domcontentloaded"); page.wait_for_timeout(3000)
        for sel in ["button#onetrust-accept-btn-handler", "button:has-text('Accept')", "button:has-text('Close')"]:
            try:
                btn = page.locator(sel).first
                if btn.is_visible(timeout=1500): btn.evaluate("el => el.click()"); page.wait_for_timeout(500)
            except Exception: pass
        cards = page.locator('[data-test="product-card"], div[class*="ProductCard"], div[class*="deal-card"], article')
        count = cards.count()
        for i in range(min(count, max_results)):
            card = cards.nth(i); name = orig_price = sale_price = "N/A"
            try: name = card.locator('[data-test="product-title"], a[class*="title"], h3').first.inner_text(timeout=2000).strip()
            except Exception: pass
            try: orig_price = card.locator('[data-test="current-price"], [class*="original-price"], span:has-text("reg"), s:has-text("$")').first.inner_text(timeout=2000).strip()
            except Exception: pass
            try: sale_price = card.locator('[data-test="sale-price"], [class*="sale"], span[class*="offer"]').first.inner_text(timeout=2000).strip()
            except Exception: pass
            if name != "N/A": results.append({"name": name[:100], "original_price": orig_price, "sale_price": sale_price}); print(f"  {len(results)}. {name[:80]} | {orig_price} -> {sale_price}")
        print(f"\\nFound {len(results)} deals:")
        for i, r in enumerate(results, 1): print(f"  {i}. {r['name']} — was {r['original_price']}, now {r['sale_price']}")
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
    const { z } = require("zod/v3");
    const listings = await stagehand.extract(`Extract up to ${CFG.maxResults} deals with product name, original price, and sale price.`, z.object({ deals: z.array(z.object({ name: z.string(), originalPrice: z.string(), salePrice: z.string() })) }));
    recorder.record("extract", { instruction: "Extract deals", results: listings });
    fs.writeFileSync(path.join(__dirname, "target_deals.py"), genPython(CFG, recorder), "utf-8");
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2), "utf-8");
    return listings;
  } catch (err) { console.error("❌", err.message); throw err; } finally { if (stagehand) await stagehand.close(); } }
if (require.main === module) { main().then(() => process.exit(0)).catch(() => process.exit(1)); }
module.exports = { main };
