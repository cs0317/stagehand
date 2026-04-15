const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient, observeAndAct } = require("../../stagehand-utils");
const fs = require("fs"); const path = require("path"); const os = require("os");

const CFG = { url: "https://www.walgreens.com", query: "vitamin D", maxResults: 5, waits: { page: 3000, type: 2000, search: 5000 } };

function genPython(cfg, recorder) { const ts = new Date().toISOString();
  return `"""Auto-generated – Walgreens Product Search. Query: ${cfg.query}. Generated: ${ts}"""
import re, os, sys, shutil
from playwright.sync_api import Playwright, sync_playwright
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws

def run(playwright: Playwright, query: str = "${cfg.query}", max_results: int = ${cfg.maxResults}) -> list:
    print(f"  Query: {query}\\n")
    port = get_free_port(); profile_dir = get_temp_profile_dir("walgreens_com")
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
        si = page.locator('input#wag-search-input, input[name="query"], input[aria-label*="search" i], input[type="search"]').first
        si.evaluate("el => el.click()"); page.wait_for_timeout(500)
        page.keyboard.press("Control+a"); si.type(query, delay=50); page.wait_for_timeout(1000); page.keyboard.press("Enter")
        page.wait_for_timeout(2000); page.wait_for_load_state("domcontentloaded"); page.wait_for_timeout(2000)
        cards = page.locator('[data-testid*="product"], div[class*="product-card"], li[class*="card"]')
        count = cards.count()
        for i in range(min(count, max_results)):
            card = cards.nth(i); name = price = size = "N/A"
            try: name = card.locator('[class*="product-name"], [class*="title"], a[class*="name"]').first.inner_text(timeout=2000).strip()
            except Exception: pass
            try: price = card.locator('[class*="price"], span:has-text("$")').first.inner_text(timeout=2000).strip()
            except Exception: pass
            try: size = card.locator('[class*="size"], [class*="count"], span[class*="variant"]').first.inner_text(timeout=2000).strip()
            except Exception: pass
            if name != "N/A": results.append({"name": name[:100], "price": price, "size": size}); print(f"  {len(results)}. {name[:80]} | {price} | {size}")
        print(f"\\nFound {len(results)} products:")
        for i, r in enumerate(results, 1): print(f"  {i}. {r['name']} — {r['price']} ({r['size']})")
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
    await observeAndAct(stagehand, page, recorder, "Click search input", "Search");
    await stagehand.act(`Type '${CFG.query}' and press Enter`); await page.waitForTimeout(CFG.waits.search);
    const { z } = require("zod/v3");
    const listings = await stagehand.extract(`Extract up to ${CFG.maxResults} products with name, price, and size/count.`, z.object({ products: z.array(z.object({ name: z.string(), price: z.string(), size: z.string() })) }));
    recorder.record("extract", { instruction: "Extract products", results: listings });
    fs.writeFileSync(path.join(__dirname, "walgreens_search.py"), genPython(CFG, recorder), "utf-8");
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2), "utf-8");
    return listings;
  } catch (err) { console.error("❌", err.message); throw err; } finally { if (stagehand) await stagehand.close(); } }
if (require.main === module) { main().then(() => process.exit(0)).catch(() => process.exit(1)); }
module.exports = { main };
