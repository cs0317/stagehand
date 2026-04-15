const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient, observeAndAct } = require("../../stagehand-utils");
const fs = require("fs"); const path = require("path"); const os = require("os");
const CFG = { url: "https://www.imdb.com", showName: "Breaking Bad", maxResults: 5, waits: { page: 3000, type: 2000, search: 5000 } };

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  return `"""
Auto-generated Playwright script – IMDb TV Show Info
Show: ${cfg.showName}
Generated on: ${ts}
"""
import re, os, sys, shutil
from playwright.sync_api import Playwright, sync_playwright
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws

def run(playwright: Playwright, show_name: str = "${cfg.showName}", max_results: int = ${cfg.maxResults}) -> dict:
    print(f"  Show: {show_name}"); print(f"  Max episodes: {max_results}\\n")
    port = get_free_port(); profile_dir = get_temp_profile_dir("imdb_com")
    chrome_proc = launch_chrome(profile_dir, port); ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]; page = context.pages[0] if context.pages else context.new_page()
    result = {"show_rating": "N/A", "num_seasons": "N/A", "top_episodes": []}
    try:
        print("Loading IMDb..."); page.goto("${cfg.url}"); page.wait_for_load_state("domcontentloaded"); page.wait_for_timeout(2000)
        for sel in ["button#onetrust-accept-btn-handler", "button:has-text('Accept')", "button:has-text('Close')"]:
            try:
                btn = page.locator(sel).first
                if btn.is_visible(timeout=1500): btn.evaluate("el => el.click()"); page.wait_for_timeout(500)
            except Exception: pass

        print(f'STEP 1: Search for "{show_name}"...')
        search_input = page.locator('input[name="q"], input[id="suggestion-search"], input[aria-label*="search" i]').first
        search_input.evaluate("el => el.click()"); page.wait_for_timeout(500)
        page.keyboard.press("Control+a"); search_input.type(show_name, delay=50)
        page.wait_for_timeout(2000)
        # Click first suggestion or press Enter
        try:
            suggestion = page.locator('[data-testid="search-result--const"] a, li[role="option"] a').first
            suggestion.wait_for(state="visible", timeout=3000); suggestion.evaluate("el => el.click()")
        except Exception: page.keyboard.press("Enter")
        page.wait_for_timeout(2000); page.wait_for_load_state("domcontentloaded"); page.wait_for_timeout(2000)

        print("STEP 2: Extract show info...")
        try:
            rating_el = page.locator('[data-testid="hero-rating-bar__aggregate-rating__score"] span, span[class*="rating"]').first
            result["show_rating"] = rating_el.inner_text(timeout=3000).strip()
        except Exception: pass
        try:
            seasons_el = page.locator('[data-testid="episodes-header"] select option, a:has-text("Season")')
            text = page.locator('[data-testid="episodes-header"]').inner_text(timeout=3000)
            m = re.search(r"(\\d+)\\s*[Ss]eason", text)
            if m: result["num_seasons"] = m.group(1)
        except Exception: pass

        print(f"STEP 3: Extract top {max_results} episodes...")
        # Navigate to episodes page
        try:
            ep_link = page.locator('a[href*="episodes"], a:has-text("Episodes")').first
            ep_link.evaluate("el => el.click()"); page.wait_for_timeout(2000)
        except Exception: pass

        ep_items = page.locator('[data-testid="episode-card"], article[class*="episode"], div[class*="episode"]')
        count = ep_items.count(); print(f"  Found {count} episodes")
        for i in range(min(count, max_results)):
            item = ep_items.nth(i)
            try:
                title = ep_num = rating = "N/A"
                try: title = item.locator('a[class*="title"], h4, [data-testid="slate-text"]').first.inner_text(timeout=2000).strip()
                except Exception: pass
                try: ep_num = item.locator('[class*="episode-number"], [class*="ep-num"]').first.inner_text(timeout=2000).strip()
                except Exception: pass
                try:
                    r_el = item.locator('[class*="rating"], [data-testid*="rating"]').first
                    rating = r_el.inner_text(timeout=2000).strip()
                except Exception: pass
                if title != "N/A":
                    result["top_episodes"].append({"title": title, "episode": ep_num, "rating": rating})
                    print(f"  {len(result['top_episodes'])}. {title} | {ep_num} | Rating: {rating}")
            except Exception as e: print(f"  Error: {e}")

        print(f"\\nShow: {show_name}")
        print(f"  Rating: {result['show_rating']}  Seasons: {result['num_seasons']}")
        print(f"  Top {len(result['top_episodes'])} episodes:")
        for i, ep in enumerate(result["top_episodes"], 1):
            print(f"    {i}. {ep['title']} ({ep['episode']}) — {ep['rating']}")
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
    await stagehand.act(`Type '${CFG.showName}' and select the first result`); await page.waitForTimeout(CFG.waits.search);
    const { z } = require("zod/v3");
    const info = await stagehand.extract(`Extract the show rating, number of seasons, and top ${CFG.maxResults} episodes with title, episode number, and rating.`,
      z.object({ showRating: z.string(), numSeasons: z.string(), topEpisodes: z.array(z.object({ title: z.string(), episode: z.string(), rating: z.string() })) }));
    recorder.record("extract", { instruction: "Extract show info", results: info });
    fs.writeFileSync(path.join(__dirname, "imdb_tvshow.py"), genPython(CFG, recorder), "utf-8");
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2), "utf-8");
    return info;
  } catch (err) { console.error("❌", err.message); throw err; } finally { if (stagehand) await stagehand.close(); }
}
if (require.main === module) { main().then(() => process.exit(0)).catch(() => process.exit(1)); }
module.exports = { main };
