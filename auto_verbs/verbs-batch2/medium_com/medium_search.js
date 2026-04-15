const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient, observeAndAct } = require("../../stagehand-utils");
const fs = require("fs"); const path = require("path"); const os = require("os");

const CFG = { url: "https://medium.com", query: "machine learning", maxResults: 5, waits: { page: 3000, type: 2000, search: 5000 } };

function genPython(cfg, recorder) { const ts = new Date().toISOString();
  return `"""Auto-generated – Medium Article Search. Query: ${cfg.query}. Generated: ${ts}"""
import re, os, sys, shutil
from playwright.sync_api import Playwright, sync_playwright
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws

def run(playwright: Playwright, query: str = "${cfg.query}", max_results: int = ${cfg.maxResults}) -> list:
    print(f"  Query: {query}\\n")
    port = get_free_port(); profile_dir = get_temp_profile_dir("medium_com")
    chrome_proc = launch_chrome(profile_dir, port); ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]; page = context.pages[0] if context.pages else context.new_page()
    results = []
    try:
        page.goto(f"${cfg.url}/search?q={query.replace(' ', '+')}")
        page.wait_for_load_state("domcontentloaded"); page.wait_for_timeout(3000)
        for sel in ["button:has-text('Accept')", "button:has-text('Got it')", "button:has-text('Close')"]:
            try:
                btn = page.locator(sel).first
                if btn.is_visible(timeout=1500): btn.evaluate("el => el.click()"); page.wait_for_timeout(500)
            except Exception: pass
        cards = page.locator('article, div[data-testid*="post"], div[class*="postPreview"]')
        count = cards.count()
        for i in range(min(count, max_results)):
            card = cards.nth(i); title = author = read_time = "N/A"
            try: title = card.locator('h2, h3, a[aria-label]').first.inner_text(timeout=2000).strip()
            except Exception: pass
            try: author = card.locator('a[data-testid="authorName"], p[class*="author"], a[rel="author"]').first.inner_text(timeout=2000).strip()
            except Exception: pass
            try: read_time = card.locator('span:has-text("min read"), span[class*="readingTime"]').first.inner_text(timeout=2000).strip()
            except Exception: pass
            if title != "N/A": results.append({"title": title, "author": author, "read_time": read_time}); print(f"  {len(results)}. {title} | {author} | {read_time}")
        print(f"\\nFound {len(results)} articles:")
        for i, r in enumerate(results, 1): print(f"  {i}. {r['title']} by {r['author']} ({r['read_time']})")
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
    await page.goto(`${CFG.url}/search?q=${CFG.query.replace(/ /g, '+')}`);
    await page.waitForLoadState("domcontentloaded"); await page.waitForTimeout(CFG.waits.search);
    const { z } = require("zod/v3");
    const listings = await stagehand.extract(`Extract up to ${CFG.maxResults} articles with title, author, and read time.`, z.object({ articles: z.array(z.object({ title: z.string(), author: z.string(), readTime: z.string() })) }));
    recorder.record("extract", { instruction: "Extract articles", results: listings });
    fs.writeFileSync(path.join(__dirname, "medium_search.py"), genPython(CFG, recorder), "utf-8");
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2), "utf-8");
    return listings;
  } catch (err) { console.error("❌", err.message); throw err; } finally { if (stagehand) await stagehand.close(); } }
if (require.main === module) { main().then(() => process.exit(0)).catch(() => process.exit(1)); }
module.exports = { main };
