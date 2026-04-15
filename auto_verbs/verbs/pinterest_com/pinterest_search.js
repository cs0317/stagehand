const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient, observeAndAct } = require("../../stagehand-utils");
const fs = require("fs"); const path = require("path"); const os = require("os");

const CFG = { url: "https://www.pinterest.com", query: "minimalist home office", maxResults: 5, waits: { page: 3000, type: 2000, search: 5000 } };

function genPython(cfg, recorder) { const ts = new Date().toISOString();
  return `"""Auto-generated – Pinterest Pin Search. Query: ${cfg.query}. Generated: ${ts}"""
import re, os, sys, shutil
from playwright.sync_api import Playwright, sync_playwright
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws

def run(playwright: Playwright, query: str = "${cfg.query}", max_results: int = ${cfg.maxResults}) -> list:
    print(f"  Query: {query}\\n")
    port = get_free_port(); profile_dir = get_temp_profile_dir("pinterest_com")
    chrome_proc = launch_chrome(profile_dir, port); ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]; page = context.pages[0] if context.pages else context.new_page()
    results = []
    try:
        page.goto(f"${cfg.url}/search/pins/?q={query.replace(' ', '+')}")
        page.wait_for_load_state("domcontentloaded"); page.wait_for_timeout(3000)
        for sel in ["button:has-text('Accept')", "button:has-text('Close')", "button:has-text('Not now')"]:
            try:
                btn = page.locator(sel).first
                if btn.is_visible(timeout=1500): btn.evaluate("el => el.click()"); page.wait_for_timeout(500)
            except Exception: pass
        cards = page.locator('[data-test-id="pin"], div[class*="Pin"], div[role="listitem"]')
        count = cards.count()
        for i in range(min(count, max_results)):
            card = cards.nth(i); title = link = "N/A"
            try: title = card.locator('a[aria-label], img[alt]').first.get_attribute("aria-label") or card.locator('img[alt]').first.get_attribute("alt") or "N/A"
            except Exception: pass
            try: link = card.locator('a[href*="/pin/"]').first.get_attribute("href") or "N/A"
            except Exception: pass
            if title != "N/A": results.append({"title": title[:100], "link": link}); print(f"  {len(results)}. {title[:80]} | {link}")
        print(f"\\nFound {len(results)} pins:")
        for i, r in enumerate(results, 1): print(f"  {i}. {r['title']}\\n     {r['link']}")
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
    await page.goto(`${CFG.url}/search/pins/?q=${CFG.query.replace(/ /g, '+')}`);
    await page.waitForLoadState("domcontentloaded"); await page.waitForTimeout(CFG.waits.search);
    const { z } = require("zod/v3");
    const listings = await stagehand.extract(`Extract up to ${CFG.maxResults} pins with title and link.`, z.object({ pins: z.array(z.object({ title: z.string(), link: z.string() })) }));
    recorder.record("extract", { instruction: "Extract pins", results: listings });
    fs.writeFileSync(path.join(__dirname, "pinterest_search.py"), genPython(CFG, recorder), "utf-8");
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2), "utf-8");
    return listings;
  } catch (err) { console.error("❌", err.message); throw err; } finally { if (stagehand) await stagehand.close(); } }
if (require.main === module) { main().then(() => process.exit(0)).catch(() => process.exit(1)); }
module.exports = { main };
