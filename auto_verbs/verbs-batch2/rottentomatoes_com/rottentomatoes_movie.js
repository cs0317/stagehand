const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient, observeAndAct } = require("../../stagehand-utils");
const fs = require("fs"); const path = require("path"); const os = require("os");

const CFG = { url: "https://www.rottentomatoes.com", movieName: "Inception", waits: { page: 3000, type: 2000, search: 5000 } };

function genPython(cfg, recorder) { const ts = new Date().toISOString();
  return `"""Auto-generated – Rotten Tomatoes Movie Info. Movie: ${cfg.movieName}. Generated: ${ts}"""
import re, os, sys, shutil
from playwright.sync_api import Playwright, sync_playwright
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws

def run(playwright: Playwright, movie_name: str = "${cfg.movieName}") -> dict:
    print(f"  Movie: {movie_name}\\n")
    port = get_free_port(); profile_dir = get_temp_profile_dir("rottentomatoes_com")
    chrome_proc = launch_chrome(profile_dir, port); ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]; page = context.pages[0] if context.pages else context.new_page()
    result = {}
    try:
        page.goto(f"${cfg.url}/search?search={movie_name.replace(' ', '+')}")
        page.wait_for_load_state("domcontentloaded"); page.wait_for_timeout(3000)
        for sel in ["button#onetrust-accept-btn-handler", "button:has-text('Accept')", "button:has-text('Close')"]:
            try:
                btn = page.locator(sel).first
                if btn.is_visible(timeout=1500): btn.evaluate("el => el.click()"); page.wait_for_timeout(500)
            except Exception: pass
        # Click first movie result
        first = page.locator('a[href*="/m/"], search-page-media-row a').first
        first.click(); page.wait_for_timeout(2000); page.wait_for_load_state("domcontentloaded"); page.wait_for_timeout(2000)

        try: result["tomatometer"] = page.locator('[data-qa="tomatometer"], score-board, [class*="tomatometer"], rt-text:has-text("%")').first.inner_text(timeout=3000).strip()
        except Exception: result["tomatometer"] = "N/A"
        try: result["audience_score"] = page.locator('[data-qa="audience-score"], [class*="audience"], rt-text[slot="audienceScore"]').first.inner_text(timeout=3000).strip()
        except Exception: result["audience_score"] = "N/A"
        try: result["synopsis"] = page.locator('[data-qa="movie-info-synopsis"], [class*="synopsis"], p[class*="what-to-know"]').first.inner_text(timeout=3000).strip()[:500]
        except Exception: result["synopsis"] = "N/A"

        print(f"Movie: {movie_name}")
        print(f"  Tomatometer:    {result.get('tomatometer', 'N/A')}")
        print(f"  Audience Score: {result.get('audience_score', 'N/A')}")
        print(f"  Synopsis:       {result.get('synopsis', 'N/A')[:200]}...")
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
    await page.goto(`${CFG.url}/search?search=${CFG.movieName.replace(/ /g, '+')}`);
    await page.waitForLoadState("domcontentloaded"); await page.waitForTimeout(CFG.waits.search);
    await observeAndAct(stagehand, page, recorder, "Click the first movie result", "Navigate to movie");
    await page.waitForTimeout(CFG.waits.page);
    const { z } = require("zod/v3");
    const data = await stagehand.extract(`Extract Tomatometer score, audience score, and synopsis.`, z.object({ tomatometer: z.string(), audienceScore: z.string(), synopsis: z.string() }));
    recorder.record("extract", { instruction: "Extract movie info", results: data });
    fs.writeFileSync(path.join(__dirname, "rottentomatoes_movie.py"), genPython(CFG, recorder), "utf-8");
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2), "utf-8");
    return data;
  } catch (err) { console.error("❌", err.message); throw err; } finally { if (stagehand) await stagehand.close(); } }
if (require.main === module) { main().then(() => process.exit(0)).catch(() => process.exit(1)); }
module.exports = { main };
