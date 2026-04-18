const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * setlist.fm – Search Concert Setlists
 *
 * Searches setlist.fm for an artist, navigates to the most recent
 * concert setlist, and extracts venue, city, date, and songs.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  artist: "Taylor Swift",
  maxSongs: 10,
  waits: { page: 5000 },
};

// ── Python Script Generator ──────────────────────────────────────────────────
function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
setlist.fm – Concert Setlists
Artist: "${cfg.artist}"

Generated on: ${ts}
Recorded ${n} browser interactions

Uses Playwright's native locator API with the user's Chrome profile.
"""

import re
import os, sys, shutil
from dataclasses import dataclass
from urllib.parse import quote_plus
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class SetlistRequest:
    artist: str = "${cfg.artist}"
    max_songs: int = ${cfg.maxSongs}


@dataclass(frozen=True)
class SetlistResult:
    venue: str = ""
    city: str = ""
    date: str = ""
    tour: str = ""
    songs: list = None  # list[str]


def setlist_search(page: Page, request: SetlistRequest) -> SetlistResult:
    """Search setlist.fm for an artist's most recent setlist."""
    print(f"  Artist: {request.artist}\\n")

    # ── Search ────────────────────────────────────────────────────────
    search_url = f"https://www.setlist.fm/search?query={quote_plus(request.artist)}"
    print(f"Loading {search_url}...")
    checkpoint("Navigate to setlist.fm search")
    page.goto(search_url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    # ── Find the most recent setlist link ─────────────────────────────
    artist_slug = request.artist.lower().replace(" ", "-")
    setlist_urls = page.evaluate(r"""(slug) => {
        const links = document.querySelectorAll('a');
        const urls = [];
        const seen = new Set();
        for (const link of links) {
            if (link.href.includes('/setlist/' + slug + '/') && !seen.has(link.href)) {
                seen.add(link.href);
                urls.push(link.href);
            }
        }
        return urls;
    }""", artist_slug)

    if not setlist_urls:
        print("No setlist found in search results")
        return SetlistResult()

    found = False
    for setlist_url in setlist_urls:
        print(f"Trying: {setlist_url}")
        checkpoint("Navigate to setlist page")
        page.goto(setlist_url, wait_until="domcontentloaded")
        page.wait_for_timeout(5000)
        song_count = page.evaluate(r"""() => document.querySelectorAll('a.songLabel').length""")
        if song_count > 0:
            print(f"  Found {song_count} songs")
            found = True
            break
        print("  No songs, trying next...")

    if not found:
        print("No setlist with songs found")
        return SetlistResult()

    # ── Extract setlist details ───────────────────────────────────────
    data = page.evaluate(r"""(maxSongs) => {
        const text = document.body.innerText;

        // Date from title or dateBlock
        let date = '';
        const titleMatch = document.title.match(/on\\s+(.+?)\\s*\\|/);
        if (titleMatch) date = titleMatch[1].trim();

        // Venue and city from heading "at Venue, City, State/Country"
        let venue = '';
        let city = '';
        const headingMatch = text.match(/at\\s+(.+?)\\n/);
        if (headingMatch) {
            const parts = headingMatch[1].split(',').map(p => p.trim());
            venue = parts[0] || '';
            city = parts.slice(1).join(', ');
        }

        // Tour
        let tour = '';
        const tourMatch = text.match(/Tour:\\s*(.+?)(?:\\s+Tour statistics|\\n)/);
        if (tourMatch) tour = tourMatch[1].trim();

        // Songs from a.songLabel
        const songEls = document.querySelectorAll('a.songLabel');
        const songs = [...songEls].slice(0, maxSongs).map(el => el.innerText.trim());

        return { venue, city, date, tour, songs };
    }""", request.max_songs)

    # ── Print results ─────────────────────────────────────────────────
    print("\\n" + "=" * 60)
    print(f"Setlist: {request.artist}")
    print("=" * 60)
    print(f"\\n  Date: {data['date']}")
    print(f"  Venue: {data['venue']}")
    print(f"  City: {data['city']}")
    if data['tour']:
        print(f"  Tour: {data['tour']}")
    print(f"\\n  Songs ({len(data['songs'])}):")
    for idx, song in enumerate(data['songs'], 1):
        print(f"    {idx}. {song}")

    return SetlistResult(
        venue=data['venue'],
        city=data['city'],
        date=data['date'],
        tour=data['tour'],
        songs=data['songs'],
    )


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("setlist_fm")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = setlist_search(page, SetlistRequest())
            print(f"\\nReturned {len(result.songs or [])} songs")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
`;
}

// ── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({
    env: "LOCAL",
    verbose: 1,
    llmClient,
    localBrowserLaunchOptions: {
      headless: false,
      args: ["--disable-blink-features=AutomationControlled", "--start-maximized"],
    },
  });
  await stagehand.init();
  const page = stagehand.context.pages()[0];
  const recorder = new PlaywrightRecorder();

  try {
    const searchUrl = `https://www.setlist.fm/search?query=${encodeURIComponent(CFG.artist).replace(/%20/g, "+")}`;
    console.log(`\n🌐 Searching: ${searchUrl}...`);
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url: searchUrl, description: "Search setlist.fm" });

    const artistSlug = CFG.artist.toLowerCase().replace(/ /g, "-");
    const setlistUrls = await page.evaluate((slug) => {
      const links = document.querySelectorAll("a");
      const urls = [];
      const seen = new Set();
      for (const link of links) {
        if (link.href.includes("/setlist/" + slug + "/") && !seen.has(link.href)) {
          seen.add(link.href);
          urls.push(link.href);
        }
      }
      return urls;
    }, artistSlug);

    if (setlistUrls.length === 0) {
      console.log("❌ No setlist found");
      await stagehand.close();
      process.exit(1);
    }

    let data = null;
    for (const setlistUrl of setlistUrls) {
      console.log(`📋 Trying: ${setlistUrl}`);
      await page.goto(setlistUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(CFG.waits.page);

      const songCount = await page.evaluate(() => document.querySelectorAll("a.songLabel").length);
      if (songCount > 0) {
        console.log(`   ✅ Found ${songCount} songs`);
        recorder.record("goto", { url: setlistUrl, description: "Navigate to setlist page" });
        break;
      }
      console.log("   ⏭️ No songs, trying next...");
    }

    data = await page.evaluate((maxSongs) => {
      const text = document.body.innerText;

      let date = "";
      const titleMatch = document.title.match(/on\s+(.+?)\s*\|/);
      if (titleMatch) date = titleMatch[1].trim();

      let venue = "";
      let city = "";
      const headingMatch = text.match(/at\s+(.+?)\n/);
      if (headingMatch) {
        const parts = headingMatch[1].split(",").map(p => p.trim());
        venue = parts[0] || "";
        city = parts.slice(1).join(", ");
      }

      let tour = "";
      const tourMatch = text.match(/Tour:\s*(.+?)(?:\s+Tour statistics|\n)/);
      if (tourMatch) tour = tourMatch[1].trim();

      const songEls = document.querySelectorAll("a.songLabel");
      const songs = [...songEls].slice(0, maxSongs).map(el => el.innerText.trim());

      return { venue, city, date, tour, songs };
    }, CFG.maxSongs);

    recorder.record("extract", {
      instruction: "Extract setlist details",
      description: `Extracted ${data.songs.length} songs`,
      results: data,
    });

    console.log("\n" + "=".repeat(60));
    console.log(`Setlist: ${CFG.artist}`);
    console.log("=".repeat(60));
    console.log(`\n   Date: ${data.date}`);
    console.log(`   Venue: ${data.venue}`);
    console.log(`   City: ${data.city}`);
    if (data.tour) console.log(`   Tour: ${data.tour}`);
    console.log(`\n   Songs (${data.songs.length}):`);
    data.songs.forEach((song, i) => console.log(`     ${i + 1}. ${song}`));

    const dir = path.join(__dirname);
    fs.writeFileSync(
      path.join(dir, "recorded_actions.json"),
      JSON.stringify(recorder.actions, null, 2)
    );
    console.log(`\n💾 Saved ${recorder.actions.length} actions`);

    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(dir, "setlist_search.py"), pyCode);
    console.log("🐍 Saved Python script");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
