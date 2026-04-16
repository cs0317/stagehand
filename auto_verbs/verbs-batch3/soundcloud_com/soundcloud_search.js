const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * SoundCloud – Track Search
 *
 * Searches SoundCloud for tracks matching a keyword.
 * Extracts track title, artist, duration, and play count.
 */

const CFG = {
  url: "https://soundcloud.com/search/sounds",
  query: "lo-fi hip hop",
  maxResults: 5,
  waits: { page: 2000, search: 8000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Playwright script (Python) — SoundCloud Track Search
Search for tracks by keyword.
Extract track title, artist, duration, and play count.

URL pattern: https://soundcloud.com/search/sounds?q={query}

Generated on: ${ts}
Recorded ${n} browser interactions
"""

import re
import os
import sys
import shutil
from urllib.parse import quote
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws


PLAYS_RE = re.compile(r"^([\\d,]+)\\s+plays?$")


def run(
    playwright: Playwright,
    query: str = "${cfg.query}",
    max_results: int = ${cfg.maxResults},
) -> list:
    print(f"  Query: {query}")
    print(f"  Max results: {max_results}\\n")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("soundcloud_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        search_url = f"https://soundcloud.com/search/sounds?q={quote(query)}"
        page.goto(search_url, wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(8000)

        try:
            page.locator('button#onetrust-accept-btn-handler').click(timeout=2000)
            page.wait_for_timeout(1000)
        except Exception:
            pass

        body = page.locator("body").inner_text(timeout=10000)
        lines = [l.strip() for l in body.split("\\n") if l.strip()]

        start_idx = 0
        for i, l in enumerate(lines):
            if "Found" in l and "track" in l:
                start_idx = i + 1
                break

        i = start_idx
        while i < len(lines) and len(results) < max_results:
            m = PLAYS_RE.match(lines[i])
            if m:
                plays = m.group(1)
                title = "N/A"
                artist = "N/A"
                posted_idx = None
                for delta in range(1, 8):
                    idx = i - delta
                    if idx >= start_idx and lines[idx].startswith("Posted "):
                        posted_idx = idx
                        break
                if posted_idx is not None:
                    if posted_idx - 1 >= start_idx:
                        title = lines[posted_idx - 1]
                    if posted_idx - 2 >= start_idx:
                        artist = lines[posted_idx - 2]
                duration = "N/A"
                if title != "N/A":
                    results.append({
                        "title": title,
                        "artist": artist,
                        "duration": duration,
                        "plays": plays,
                    })
                i += 1
                continue
            i += 1

        print(f'\\nFound {len(results)} tracks for "{query}":\\n')
        for idx, t in enumerate(results, 1):
            print(f"  {idx}. {t['title']}")
            print(f"     Artist: {t['artist']}")
            print(f"     Duration: {t['duration']}  Plays: {t['plays']}")
            print()

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
        items = run(playwright)
        print(f"\\nTotal tracks found: {len(items)}")
`;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  SoundCloud – Track Search");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(\`  🔍 Query: \${CFG.query}\`);
  console.log(\`  📊 Max results: \${CFG.maxResults}\\n\`);

  const recorder = new PlaywrightRecorder();
  const llmClient = setupLLMClient("hybrid");
  let stagehand;

  try {
    stagehand = new Stagehand({
      env: "LOCAL", verbose: 0, llmClient,
      localBrowserLaunchOptions: {
        headless: false,
        viewport: { width: 1920, height: 1080 },
        args: ["--disable-blink-features=AutomationControlled", "--start-maximized"],
      },
    });
    await stagehand.init();
    const page = stagehand.context.pages()[0];

    const searchUrl = \`\${CFG.url}?q=\${encodeURIComponent(CFG.query)}\`;
    console.log(\`🌐 Loading \${searchUrl}...\`);
    recorder.goto(searchUrl);
    await page.goto(searchUrl);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(CFG.waits.search);
    console.log("✅ Loaded\\n");

    const { z } = require("zod/v3");
    const listings = await stagehand.extract(
      \`Extract up to \${CFG.maxResults} track results. For each, get the track title, artist name, duration, and play count.\`,
      z.object({
        tracks: z.array(z.object({
          title: z.string().describe("Track title"),
          artist: z.string().describe("Artist or uploader name"),
          duration: z.string().describe("Duration or 'N/A'"),
          plays: z.string().describe("Play count"),
        })).describe(\`Up to \${CFG.maxResults} tracks\`),
      })
    );

    recorder.record("extract", {
      instruction: "Extract track listings",
      results: listings,
    });

    console.log(\`📋 Found \${listings.tracks.length} tracks:\`);
    listings.tracks.forEach((t, i) => {
      console.log(\`   \${i + 1}. \${t.title}\`);
      console.log(\`      Artist: \${t.artist}  Duration: \${t.duration}  Plays: \${t.plays}\`);
    });

    const pyScript = genPython(CFG, recorder);
    const pyPath = path.join(__dirname, "soundcloud_search.py");
    fs.writeFileSync(pyPath, pyScript, "utf-8");
    console.log(\`\\n✅ Python: \${pyPath}\`);

    const jsonPath = path.join(__dirname, "recorded_actions.json");
    fs.writeFileSync(jsonPath, JSON.stringify(recorder.actions, null, 2), "utf-8");
    console.log(\`📋 Actions: \${jsonPath}\`);

    return listings;
  } catch (err) {
    console.error("\\n❌ Error:", err.message);
    throw err;
  } finally {
    if (stagehand) await stagehand.close();
  }
}

if (require.main === module) {
  main().then(() => { console.log("🎊 Done!"); process.exit(0); }).catch((e) => { console.error("💥", e.message); process.exit(1); });
}
module.exports = { main };
