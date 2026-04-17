const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient, observeAndAct } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");
const os = require("os");

/**
 * YouTube – Trending Videos
 *
 * Navigate to YouTube's Trending page and extract up to N trending videos
 * with title, channel name, view count, and upload time.
 * Records interactions and generates a Python Playwright script.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  url: "https://www.youtube.com",
  trendingPath: "/feed/trending",
  maxResults: 10,
  waits: { page: 3000, nav: 2000, extract: 2000 },
};

// ── Python Script Generator ──────────────────────────────────────────────────
function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
YouTube – Trending Videos
Extract up to ${cfg.maxResults} trending videos with title, channel, views, upload time.

Generated on: ${ts}
Recorded ${n} browser interactions

Uses Playwright's native locator API with CDP connection to real Chrome.
"""

import re
import os
import sys
import shutil
import json
import socket
import subprocess
import tempfile
import time
from urllib.request import urlopen
from playwright.sync_api import Playwright, sync_playwright


# ── Inline CDP utilities (no external dependency) ────────────────────────────

def get_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def get_temp_profile_dir(site: str = "default") -> str:
    tmp = os.path.join(tempfile.gettempdir(), f"{site}_chrome_profile_{os.getpid()}")
    os.makedirs(tmp, exist_ok=True)
    return tmp


def find_chrome_executable() -> str:
    for candidate in [
        os.environ.get("CHROME_PATH", ""),
        "/usr/bin/google-chrome",
        "/usr/bin/google-chrome-stable",
        "/usr/bin/chromium-browser",
        "/usr/bin/chromium",
    ]:
        if candidate and os.path.isfile(candidate):
            return candidate
    raise FileNotFoundError("Could not find Chrome/Chromium.")


def launch_chrome(profile_dir: str, port: int, headless: bool = False) -> subprocess.Popen:
    chrome_path = find_chrome_executable()
    flags = [
        chrome_path,
        f"--remote-debugging-port={port}",
        f"--user-data-dir={profile_dir}",
        "--remote-allow-origins=*",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-software-rasterizer",
        "--disable-blink-features=AutomationControlled",
        "--disable-extensions",
        "--disable-component-extensions-with-background-pages",
        "--disable-background-networking",
        "--disable-sync",
        "--disable-default-apps",
        "--mute-audio",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
        "--disable-background-timer-throttling",
        "--disable-infobars",
        "--window-size=1280,987",
        "about:blank",
    ]
    if headless:
        flags.insert(1, "--headless=new")
    return subprocess.Popen(flags, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def wait_for_cdp_ws(port: int, timeout_s: float = 15.0) -> str:
    deadline = time.time() + timeout_s
    last_err = ""
    while time.time() < deadline:
        try:
            resp = urlopen(f"http://127.0.0.1:{port}/json/version", timeout=2)
            data = json.loads(resp.read())
            ws_url = data.get("webSocketDebuggerUrl", "")
            if ws_url:
                return ws_url
        except Exception as e:
            last_err = str(e)
        time.sleep(0.25)
    raise TimeoutError(f"Timed out waiting for Chrome CDP on port {port}: {last_err}")


# ── Main extraction function ─────────────────────────────────────────────────

def extract_trending_videos(
    playwright: Playwright,
    max_results: int = ${cfg.maxResults},
) -> list[dict]:
    """
    Navigate to YouTube Trending and extract video listings.

    Parameters:
        max_results: Maximum number of trending videos to extract.

    Returns:
        List of dicts with keys: title, channel_name, view_count, upload_time.
    """
    port = get_free_port()
    profile_dir = get_temp_profile_dir("youtube_trending")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        # ── Navigate to Trending ──────────────────────────────────────────
        trending_url = "${cfg.url}${cfg.trendingPath}"
        print(f"Loading {trending_url}...")
        page.goto(trending_url)
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(3000)
        current_url = page.url
        print(f"  Loaded: {current_url}")

        if "trending" not in current_url:
            # Trending page may require sign-in; fall back to search
            print("  Trending page not accessible, using search fallback...")
            search_url = "${cfg.url}/results?search_query=trending+today&sp=CAI%253D"
            page.goto(search_url)
            page.wait_for_load_state("domcontentloaded")
            page.wait_for_timeout(3000)
            print(f"  Loaded search: {page.url}")

        # ── Dismiss cookie / consent dialogs ──────────────────────────────
        for selector in [
            'button[aria-label="Accept all"]',
            'button[aria-label="Accept the use of cookies and other data for the purposes described"]',
            'button:has-text("Accept all")',
            'button:has-text("Reject all")',
            'tp-yt-paper-dialog button#button',
        ]:
            try:
                btn = page.locator(selector).first
                if btn.is_visible(timeout=1500):
                    btn.click()
                    page.wait_for_timeout(500)
                    break
            except Exception:
                pass

        # Wait for video content to load
        page.wait_for_timeout(2000)

        # ── Extract trending videos ──────────────────────────────────────
        print(f"Extracting up to {max_results} trending videos...")

        # YouTube trending uses ytd-video-renderer or ytd-expanded-shelf-contents-renderer
        video_renderers = page.locator("ytd-video-renderer")
        count = video_renderers.count()
        print(f"  Found {count} video renderers")

        seen_titles = set()
        for i in range(count):
            if len(results) >= max_results:
                break
            renderer = video_renderers.nth(i)
            try:
                # Title
                title = "N/A"
                try:
                    title_el = renderer.locator("#video-title").first
                    title = title_el.inner_text(timeout=2000).strip()
                except Exception:
                    pass

                if title == "N/A" or title.lower() in seen_titles:
                    continue
                seen_titles.add(title.lower())

                # Channel name
                channel_name = "N/A"
                try:
                    channel_el = renderer.locator(
                        "ytd-channel-name a, "
                        "#channel-name a, "
                        "#channel-name #text"
                    ).first
                    channel_name = channel_el.inner_text(timeout=2000).strip()
                except Exception:
                    pass

                # Metadata line: views and upload time
                view_count = "N/A"
                upload_time = "N/A"
                try:
                    meta_el = renderer.locator("#metadata-line span.inline-metadata-item")
                    meta_count = meta_el.count()
                    for mi in range(meta_count):
                        text = meta_el.nth(mi).inner_text(timeout=1000).strip()
                        if "view" in text.lower():
                            view_count = text
                        elif "ago" in text.lower() or "hour" in text.lower() or "day" in text.lower() or "week" in text.lower():
                            upload_time = text
                except Exception:
                    pass

                results.append({
                    "title": title,
                    "channel_name": channel_name,
                    "view_count": view_count,
                    "upload_time": upload_time,
                })
            except Exception:
                continue

        # ── Fallback: regex on page text ──────────────────────────────────
        if not results:
            print("  Renderer extraction failed, trying text fallback...")
            body_text = page.evaluate("document.body.innerText") or ""
            lines = body_text.split("\\n")
            for i, line in enumerate(lines):
                if len(results) >= max_results:
                    break
                view_match = re.search(r"([\\d,.]+[KMB]?)\\s*views?", line, re.IGNORECASE)
                if view_match and len(line.strip()) < 200:
                    # Look backward for title
                    title = "N/A"
                    channel = "N/A"
                    for j in range(max(0, i - 5), i):
                        cand = lines[j].strip()
                        if cand and len(cand) > 5 and "view" not in cand.lower():
                            if title == "N/A":
                                title = cand
                            else:
                                channel = cand
                    # Look for time ago
                    upload_time = "N/A"
                    time_match = re.search(r"(\\d+\\s+(?:second|minute|hour|day|week|month|year)s?\\s+ago)", line, re.IGNORECASE)
                    if time_match:
                        upload_time = time_match.group(1)

                    if title != "N/A":
                        results.append({
                            "title": title,
                            "channel_name": channel,
                            "view_count": view_match.group(0),
                            "upload_time": upload_time,
                        })

        # ── Print results ─────────────────────────────────────────────────
        print(f"\\nFound {len(results)} trending videos:")
        for i, vid in enumerate(results, 1):
            print(f"  {i}. {vid['title']}")
            print(f"     Channel: {vid['channel_name']}  Views: {vid['view_count']}  Uploaded: {vid['upload_time']}")

    except Exception as e:
        import traceback
        print(f"Error: {e}")
        traceback.print_exc()
    finally:
        try:
            browser.close()
        except Exception:
            pass
        chrome_proc.terminate()
        shutil.rmtree(profile_dir, ignore_errors=True)

    return results


if __name__ == "__main__":
    with sync_playwright() as playwright:
        items = extract_trending_videos(playwright)
        print(f"\\nTotal trending videos found: {len(items)}")
`;
}

// ── Step Functions ───────────────────────────────────────────────────────────

async function dismissPopups(page) {
  console.log("🔲 Dismissing popups...");
  // YouTube consent dialog
  try {
    const consentBtn = page.locator('button[aria-label="Accept all"], button:has-text("Accept all")');
    if (await consentBtn.first().isVisible({ timeout: 2000 })) {
      await consentBtn.first().click();
      console.log("   ✅ Accepted consent");
      await page.waitForTimeout(1000);
    }
  } catch (e) { /* no consent dialog */ }

  // "Sign in" prompt or other overlays
  try {
    const dismissBtn = page.locator('button[aria-label="No thanks"], tp-yt-paper-dialog button#button');
    if (await dismissBtn.first().isVisible({ timeout: 1000 })) {
      await dismissBtn.first().click();
      console.log("   ✅ Dismissed overlay");
    }
  } catch (e) { /* no overlay */ }

  await page.waitForTimeout(500);
}

async function navigateToTrending(stagehand, page, recorder) {
  console.log("🎯 STEP 1: Navigate to Trending...");

  // Try the direct trending URL first
  recorder.goto(`${CFG.url}${CFG.trendingPath}`);
  await page.goto(`${CFG.url}${CFG.trendingPath}`);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(CFG.waits.page);
  let url = page.url();
  console.log(`   Loaded: ${url}`);

  if (url.includes("trending")) {
    console.log("   ✅ On trending page!");
    return;
  }

  // Trending requires login — use YouTube search as fallback
  console.log("   ⚠️ Trending page not accessible (may require sign-in)");
  console.log("   Falling back to YouTube search for trending content...");
  const searchUrl = `${CFG.url}/results?search_query=trending+today&sp=CAI%253D`;
  await page.goto(searchUrl);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(CFG.waits.page);
  url = page.url();
  console.log(`   ✅ Loaded search results: ${url}`);

  recorder.record("act", {
    instruction: "Navigate to trending content",
    description: "Direct trending URL redirected; using YouTube search fallback",
    method: "goto",
  });

  console.log(`   📍 Final URL: ${url}`);
  console.log(`   📄 Page title: ${await page.title()}`);
}

async function extractTrendingVideos(stagehand, page, recorder) {
  console.log(`🎯 STEP 2: Extract up to ${CFG.maxResults} trending videos...\n`);
  const { z } = require("zod/v3");

  // Scroll down to ensure more videos are loaded
  await page.evaluate(() => window.scrollBy(0, 1500));
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);

  const data = await stagehand.extract(
    `Extract up to ${CFG.maxResults} video listings visible on this YouTube page. For each video, get: the video title, the channel name (the creator/uploader who posted it), the view count (e.g. "1.2M views" or "500K views"), and the upload time (e.g. "2 hours ago", "1 day ago", "3 weeks ago"). Only include real video listings, not ads, shorts, or promoted content. If you cannot find a field, use "N/A".`,
    z.object({
      videos: z.array(z.object({
        title: z.string().describe("Video title"),
        channel_name: z.string().describe("Channel/creator name"),
        view_count: z.string().describe("View count, e.g. '1.2M views' or '500K views'"),
        upload_time: z.string().describe("Upload time relative, e.g. '2 hours ago' or '1 day ago'"),
      })).describe(`Up to ${CFG.maxResults} video listings`),
    })
  );

  recorder.record("extract", {
    instruction: "Extract trending video listings",
    description: `Extract up to ${CFG.maxResults} trending videos with title, channel, views, upload time`,
    results: data,
  });

  console.log(`📋 Found ${data.videos.length} trending videos:`);
  data.videos.forEach((v, i) => {
    console.log(`   ${i + 1}. ${v.title}`);
    console.log(`      📺 ${v.channel_name}  👁️ ${v.view_count}  🕐 ${v.upload_time}`);
  });

  return data;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  YouTube – Trending Videos");
  console.log("  🔍 AI-driven discovery + Playwright extraction");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  📊 Max results: ${CFG.maxResults}\n`);

  const recorder = new PlaywrightRecorder();
  const llmClient = setupLLMClient("hybrid");
  let stagehand;

  try {
    console.log("🎭 Initializing Stagehand...");
    stagehand = new Stagehand({
      env: "LOCAL",
      verbose: 0,
      llmClient,
      localBrowserLaunchOptions: {
        headless: false,
        viewport: { width: 1920, height: 1080 },
        args: [
          "--disable-blink-features=AutomationControlled",
          "--disable-infobars",
          "--disable-extensions",
          "--start-maximized",
          "--window-size=1920,1080",
        ],
      },
    });
    await stagehand.init();
    console.log("✅ Stagehand ready\n");

    const page = stagehand.context.pages()[0];

    // Step 1: Navigate to trending
    await navigateToTrending(stagehand, page, recorder);
    await dismissPopups(page);

    // Step 2: Extract trending videos
    const data = await extractTrendingVideos(stagehand, page, recorder);

    console.log("\n═══════════════════════════════════════════════════════════");
    console.log(`  ✅ DONE — ${data.videos.length} trending videos found`);
    console.log("═══════════════════════════════════════════════════════════");
    data.videos.forEach((v, i) => {
      console.log(`  ${i + 1}. ${v.title} — ${v.channel_name} (${v.view_count}, ${v.upload_time})`);
    });

    // Save Python + JSON
    const pyScript = genPython(CFG, recorder);
    const pyPath = path.join(__dirname, "youtube_trending.py");
    fs.writeFileSync(pyPath, pyScript, "utf-8");
    console.log(`\n✅ Python: ${pyPath}`);

    const jsonPath = path.join(__dirname, "recorded_actions.json");
    fs.writeFileSync(jsonPath, JSON.stringify(recorder.actions, null, 2), "utf-8");
    console.log(`📋 Actions: ${jsonPath}`);

    return data;

  } catch (err) {
    console.error("\n❌ Error:", err.message);
    if (recorder?.actions.length > 0) {
      const pyScript = genPython(CFG, recorder);
      fs.writeFileSync(path.join(__dirname, "youtube_trending.py"), pyScript, "utf-8");
      console.log("⚠️  Partial Python saved");
    }
    throw err;
  } finally {
    if (stagehand) {
      console.log("🧹 Closing...");
      await stagehand.close();
    }
  }
}

if (require.main === module) {
  main().then(() => { console.log("🎊 Done!"); process.exit(0); }).catch((e) => { console.error("💥", e.message); process.exit(1); });
}
module.exports = { main };
