const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient, observeAndAct } = require("../../stagehand-utils");
const fs = require("fs"); const path = require("path"); const os = require("os");

const CFG = { url: "https://www.youtube.com", channel: "Veritasium", waits: { page: 3000, type: 2000, search: 5000 } };

function genPython(cfg, recorder) { const ts = new Date().toISOString();
  return `"""Auto-generated – YouTube Channel Info. Channel: ${cfg.channel}. Generated: ${ts}"""
import re, os, sys, shutil
from playwright.sync_api import Playwright, sync_playwright
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws

def run(playwright: Playwright, channel: str = "${cfg.channel}") -> dict:
    print(f"  Channel: {channel}\\n")
    port = get_free_port(); profile_dir = get_temp_profile_dir("youtube_com")
    chrome_proc = launch_chrome(profile_dir, port); ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]; page = context.pages[0] if context.pages else context.new_page()
    result = {}
    try:
        page.goto("${cfg.url}"); page.wait_for_load_state("domcontentloaded"); page.wait_for_timeout(3000)
        for sel in ["button:has-text('Accept all')", "button:has-text('Accept')", "button:has-text('Reject all')", "button[aria-label*='Accept']"]:
            try:
                btn = page.locator(sel).first
                if btn.is_visible(timeout=1500): btn.evaluate("el => el.click()"); page.wait_for_timeout(500)
            except Exception: pass
        si = page.locator('input[id="search"], input[name="search_query"], input[aria-label*="Search"]').first
        si.evaluate("el => el.click()"); page.wait_for_timeout(500)
        page.keyboard.press("Control+a"); si.type(channel, delay=50); page.wait_for_timeout(1000); page.keyboard.press("Enter")
        page.wait_for_timeout(3000); page.wait_for_load_state("domcontentloaded"); page.wait_for_timeout(2000)
        # Click the channel result
        try:
            ch_link = page.locator('a[href*="/@"], ytd-channel-renderer a, a[class*="channel"]').first
            ch_link.click(); page.wait_for_timeout(3000); page.wait_for_load_state("domcontentloaded")
        except Exception: pass
        # Extract subscriber count
        try:
            sub_el = page.locator('[id="subscriber-count"], yt-formatted-string[id="subscriber-count"], [class*="subscriber"]').first
            result["subscribers"] = sub_el.inner_text(timeout=3000).strip()
        except Exception: result["subscribers"] = "N/A"
        # Extract video count
        try:
            vid_el = page.locator('[class*="video-count"], span:has-text("videos"), [class*="channel-header"] span:has-text("video")').first
            result["video_count"] = vid_el.inner_text(timeout=3000).strip()
        except Exception: result["video_count"] = "N/A"
        # Extract description
        try:
            desc_el = page.locator('[id="description"], yt-formatted-string[id="description"], [class*="channel-description"], meta[name="description"]')
            txt = desc_el.first.inner_text(timeout=3000).strip()
            if not txt:
                txt = desc_el.first.get_attribute("content", timeout=3000) or "N/A"
            result["description"] = txt[:500]
        except Exception: result["description"] = "N/A"
        print(f"Channel: {channel}")
        print(f"  Subscribers: {result.get('subscribers', 'N/A')}")
        print(f"  Video Count: {result.get('video_count', 'N/A')}")
        print(f"  Description: {result.get('description', 'N/A')[:200]}")
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
    await observeAndAct(stagehand, page, recorder, "Click the search input field", "Search");
    await stagehand.act(`Type '${CFG.channel}' and press Enter`); await page.waitForTimeout(CFG.waits.search);
    await observeAndAct(stagehand, page, recorder, "Click on the channel result for " + CFG.channel, "Navigate to channel");
    await page.waitForTimeout(CFG.waits.page);
    const { z } = require("zod/v3");
    const info = await stagehand.extract(`Extract the channel info: subscriber count, total video count, and channel description.`, z.object({ subscribers: z.string(), video_count: z.string(), description: z.string() }));
    recorder.record("extract", { instruction: "Extract channel info", results: info });
    fs.writeFileSync(path.join(__dirname, "youtube_channel.py"), genPython(CFG, recorder), "utf-8");
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2), "utf-8");
    return info;
  } catch (err) { console.error("❌", err.message); throw err; } finally { if (stagehand) await stagehand.close(); } }
if (require.main === module) { main().then(() => process.exit(0)).catch(() => process.exit(1)); }
module.exports = { main };
