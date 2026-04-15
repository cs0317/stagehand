const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient, observeAndAct } = require("../../stagehand-utils");
const fs = require("fs"); const path = require("path"); const os = require("os");

const CFG = { url: "https://en.wikipedia.org", article: "List of programming languages", maxResults: 10, waits: { page: 3000, type: 2000, search: 5000 } };

function genPython(cfg, recorder) { const ts = new Date().toISOString();
  return `"""Auto-generated – Wikipedia List Article Extraction. Article: ${cfg.article}. Generated: ${ts}"""
import re, os, sys, shutil
from playwright.sync_api import Playwright, sync_playwright
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws

def run(playwright: Playwright, article: str = "${cfg.article}", max_results: int = ${cfg.maxResults}) -> list:
    print(f"  Article: {article}\\n")
    port = get_free_port(); profile_dir = get_temp_profile_dir("wikipedia_org")
    chrome_proc = launch_chrome(profile_dir, port); ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]; page = context.pages[0] if context.pages else context.new_page()
    results = []
    try:
        page.goto("${cfg.url}"); page.wait_for_load_state("domcontentloaded"); page.wait_for_timeout(2000)
        si = page.locator('input[id="searchInput"], input[name="search"], input[aria-label*="search" i]').first
        si.evaluate("el => el.click()"); page.wait_for_timeout(500)
        page.keyboard.press("Control+a"); si.type(article, delay=50); page.wait_for_timeout(1000); page.keyboard.press("Enter")
        page.wait_for_timeout(3000); page.wait_for_load_state("domcontentloaded"); page.wait_for_timeout(2000)
        # Click first search result if on search results page
        try:
            first_link = page.locator('div.mw-search-result-heading a, ul.mw-search-results a').first
            if first_link.is_visible(timeout=2000): first_link.click(); page.wait_for_timeout(2000); page.wait_for_load_state("domcontentloaded")
        except Exception: pass
        # Extract from the list/table on the article page
        rows = page.locator('#mw-content-text table.wikitable tr, #mw-content-text ul li')
        count = rows.count()
        for i in range(min(count, max_results + 5)):
            if len(results) >= max_results: break
            row = rows.nth(i); text = ""
            try: text = row.inner_text(timeout=2000).strip()
            except Exception: continue
            if not text or len(text) < 3: continue
            # Try to parse name, year, paradigm from table row or list item
            parts = [p.strip() for p in text.split("\\t") if p.strip()]
            if len(parts) >= 3:
                results.append({"name": parts[0], "year_created": parts[1], "paradigm": parts[2]})
            elif len(parts) >= 1:
                name = parts[0].split("–")[0].split("-")[0].strip()
                results.append({"name": name, "year_created": "N/A", "paradigm": "N/A"})
            if results: print(f"  {len(results)}. {results[-1]['name']} | {results[-1]['year_created']} | {results[-1]['paradigm']}")
        print(f"\\nFound {len(results)} entries:")
        for i, r in enumerate(results, 1): print(f"  {i}. {r['name']} — Year: {r['year_created']}, Paradigm: {r['paradigm']}")
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
    await observeAndAct(stagehand, page, recorder, "Click the search input field", "Search");
    await stagehand.act(`Type '${CFG.article}' and press Enter`); await page.waitForTimeout(CFG.waits.search);
    await observeAndAct(stagehand, page, recorder, "Click the first search result link for the list article", "Navigate");
    await page.waitForTimeout(CFG.waits.page);
    const { z } = require("zod/v3");
    const entries = await stagehand.extract(`Extract the first ${CFG.maxResults} programming languages from the list. For each, get the name, year created, and paradigm.`, z.object({ languages: z.array(z.object({ name: z.string(), year_created: z.string(), paradigm: z.string() })) }));
    recorder.record("extract", { instruction: "Extract list entries", results: entries });
    fs.writeFileSync(path.join(__dirname, "wikipedia_list.py"), genPython(CFG, recorder), "utf-8");
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2), "utf-8");
    return entries;
  } catch (err) { console.error("❌", err.message); throw err; } finally { if (stagehand) await stagehand.close(); } }
if (require.main === module) { main().then(() => process.exit(0)).catch(() => process.exit(1)); }
module.exports = { main };
