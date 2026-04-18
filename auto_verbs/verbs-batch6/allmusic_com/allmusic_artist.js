const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * AllMusic – Artist Info
 *
 * Searches allmusic.com for an artist and extracts info + top albums.
 */

const CFG = {
  artist: "Miles Davis",
  maxAlbums: 5,
  waits: { page: 5000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
AllMusic – Artist Info
Artist: "${cfg.artist}"

Generated on: ${ts}
Recorded ${n} browser interactions
"""

import re
import os, sys, shutil
from dataclasses import dataclass, field
from urllib.parse import quote_plus
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class ArtistRequest:
    artist: str = "${cfg.artist}"
    max_albums: int = ${cfg.maxAlbums}


@dataclass
class Album:
    name: str = ""
    year: str = ""
    rating: str = ""


@dataclass
class ArtistResult:
    artist_name: str = ""
    active_years: str = ""
    genres: str = ""
    bio_summary: str = ""
    albums: list = field(default_factory=list)


def allmusic_artist(page: Page, request: ArtistRequest) -> ArtistResult:
    """Search AllMusic for artist info."""
    print(f"  Artist: {request.artist}\\n")

    search_url = f"https://www.allmusic.com/search/all/{quote_plus(request.artist)}"
    print(f"Loading {search_url}...")
    checkpoint("Navigate to AllMusic search")
    page.goto(search_url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    # Click on first artist result
    try:
        first_result = page.locator('a[href*="/artist/"]').first
        if first_result.is_visible(timeout=5000):
            first_result.click()
            page.wait_for_timeout(5000)
            print("  Clicked first artist result")
    except Exception:
        print("  No artist link found")

    # Extract artist details
    checkpoint("Extract artist details")
    body_text = page.evaluate("document.body.innerText") or ""

    artist_name = request.artist
    active_years = ""
    genres = ""
    bio_summary = ""

    # Artist name from page
    for sel in ['h1', '.artist-name', '[itemprop="name"]']:
        try:
            el = page.locator(sel).first
            if el.is_visible(timeout=2000):
                artist_name = el.inner_text().strip()
                break
        except Exception:
            pass

    # Active years
    aym = re.search(r"(?:Active|Years Active)[:\\s]*([\\d\\s\\-,]+)", body_text, re.IGNORECASE)
    if aym:
        active_years = aym.group(1).strip()

    # Genres
    gm = re.search(r"(?:Genre|Genres)[:\\s]*([^\\n]+)", body_text, re.IGNORECASE)
    if gm:
        genres = gm.group(1).strip()

    # Bio
    for sel in ['.biography p', '.bio', '[itemprop="description"]']:
        try:
            el = page.locator(sel).first
            if el.is_visible(timeout=2000):
                bio_summary = el.inner_text().strip()[:300]
                break
        except Exception:
            pass

    # Extract albums
    checkpoint("Extract top albums")
    albums = page.evaluate(r"""(maxAlbums) => {
        const results = [];
        const rows = document.querySelectorAll(
            '.discography tr, .album, [class*="album-row"], table tbody tr'
        );
        for (const row of rows) {
            if (results.length >= maxAlbums) break;
            const nameEl = row.querySelector('a, .title, td:nth-child(2)');
            const yearEl = row.querySelector('.year, time, td:nth-child(1)');
            const ratingEl = row.querySelector('.rating, [class*="rating"], td:nth-child(3)');
            const name = nameEl ? nameEl.innerText.trim() : '';
            const year = yearEl ? yearEl.innerText.trim() : '';
            const rating = ratingEl ? ratingEl.innerText.trim() : '';
            if (name && name.length > 1 && name.length < 200) {
                results.push({ name, year, rating });
            }
        }
        return results;
    }""", request.max_albums)

    result = ArtistResult(
        artist_name=artist_name,
        active_years=active_years,
        genres=genres,
        bio_summary=bio_summary,
        albums=[Album(**a) for a in albums],
    )

    print("\\n" + "=" * 60)
    print(f"AllMusic: {result.artist_name}")
    print("=" * 60)
    print(f"  Active Years: {result.active_years}")
    print(f"  Genres:       {result.genres}")
    print(f"  Bio:          {result.bio_summary[:100]}...")
    if result.albums:
        print("\\n  Top Albums:")
        for a in result.albums:
            print(f"    - {a.name} ({a.year}) {a.rating}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("allmusic_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = allmusic_artist(page, ArtistRequest())
            print(f"\\nReturned info for {result.artist_name}")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
`;
}

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
    const searchUrl = `https://www.allmusic.com/search/all/${encodeURIComponent(CFG.artist)}`;
    console.log(`\n🌐 Searching: ${searchUrl}...`);
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url: searchUrl, description: "Search AllMusic" });

    // Click first artist result
    try {
      await stagehand.act("click the first artist result link");
      await page.waitForTimeout(CFG.waits.page);
      recorder.record("click", { description: "Clicked first artist result" });
    } catch (e) {
      console.log("   Could not click artist result");
    }

    const artistData = await stagehand.extract(
      "extract artist name, active years, genres, and a brief biography summary"
    );
    console.log("\n📊 Artist:", JSON.stringify(artistData, null, 2));
    recorder.record("extract", {
      instruction: "Extract artist info",
      description: "Extracted artist data",
      results: artistData,
    });

    const dir = path.join(__dirname);
    fs.writeFileSync(path.join(dir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    console.log(`\n💾 Saved ${recorder.actions.length} actions`);

    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(dir, "allmusic_artist.py"), pyCode);
    console.log("🐍 Saved Python script");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
