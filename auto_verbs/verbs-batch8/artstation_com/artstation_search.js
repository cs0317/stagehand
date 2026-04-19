const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * ArtStation – Search Artwork
 *
 * Searches artstation.com for artwork by keyword and extracts
 * title, artist name, medium, likes, views, and tags.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  searchQuery: "concept art",
  maxResults: 5,
  waits: { page: 5000 },
};

// ── Python Script Generator ──────────────────────────────────────────────────
function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
ArtStation – Search Artwork
Query: "${cfg.searchQuery}"

Generated on: ${ts}
Recorded ${n} browser interactions

Uses Playwright's native locator API with the user's Chrome profile.
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
class ArtStationRequest:
    search_query: str = "${cfg.searchQuery}"
    max_results: int = ${cfg.maxResults}


@dataclass
class Artwork:
    title: str = ""
    artist_name: str = ""
    medium: str = ""
    num_likes: str = ""
    num_views: str = ""
    tags: str = ""


@dataclass
class ArtStationResult:
    artworks: list = field(default_factory=list)


def artstation_search(page: Page, request: ArtStationRequest) -> ArtStationResult:
    """Search artstation.com for artwork."""
    print(f"  Query: {request.search_query}\\n")

    # ── Search ────────────────────────────────────────────────────────
    search_url = f"https://www.artstation.com/search?query={quote_plus(request.search_query)}&sort_by=relevance"
    print(f"Loading {search_url}...")
    checkpoint("Navigate to ArtStation search")
    page.goto(search_url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    # ── Extract artworks ──────────────────────────────────────────────
    raw_artworks = page.evaluate(r"""(maxResults) => {
        const cards = document.querySelectorAll('div[class*="project-card"], div[class*="gallery-grid-item"], a[class*="project"]');
        const results = [];
        for (let i = 0; i < Math.min(cards.length, maxResults); i++) {
            const card = cards[i];
            const titleEl = card.querySelector('h3, [class*="project-name"], [class*="title"]');
            const artistEl = card.querySelector('[class*="artist-name"], [class*="user-name"], [class*="author"]');
            const mediumEl = card.querySelector('[class*="medium"], [class*="software"]');
            const likesEl = card.querySelector('[class*="likes"], [class*="like-count"]');
            const viewsEl = card.querySelector('[class*="views"], [class*="view-count"]');

            results.push({
                title: titleEl ? titleEl.innerText.trim() : '',
                artist_name: artistEl ? artistEl.innerText.trim() : '',
                medium: mediumEl ? mediumEl.innerText.trim() : '',
                num_likes: likesEl ? likesEl.innerText.trim() : '0',
                num_views: viewsEl ? viewsEl.innerText.trim() : '0',
                tags: '',
            });
        }
        return results;
    }""", request.max_results)

    # ── Print results ─────────────────────────────────────────────────
    print("\\n" + "=" * 60)
    print(f"ArtStation: {request.search_query}")
    print("=" * 60)
    for idx, a in enumerate(raw_artworks, 1):
        print(f"\\n  {idx}. {a['title']}")
        print(f"     Artist: {a['artist_name']}")
        if a['medium']:
            print(f"     Medium: {a['medium']}")
        print(f"     Likes: {a['num_likes']}  Views: {a['num_views']}")
        if a['tags']:
            print(f"     Tags: {a['tags']}")

    artworks = [Artwork(**a) for a in raw_artworks]
    return ArtStationResult(artworks=artworks)


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("artstation_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = artstation_search(page, ArtStationRequest())
            print(f"\\nReturned {len(result.artworks)} artworks")
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
    const searchUrl = `https://www.artstation.com/search?query=${encodeURIComponent(CFG.searchQuery)}&sort_by=relevance`;
    console.log(`\n🌐 Searching: ${searchUrl}...`);
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url: searchUrl, description: "Search ArtStation" });

    const artworks = await page.evaluate((maxResults) => {
      const cards = document.querySelectorAll('div[class*="project-card"], div[class*="gallery-grid-item"], a[class*="project"]');
      const results = [];
      for (let i = 0; i < Math.min(cards.length, maxResults); i++) {
        const card = cards[i];
        const titleEl = card.querySelector('h3, [class*="project-name"], [class*="title"]');
        const artistEl = card.querySelector('[class*="artist-name"], [class*="user-name"], [class*="author"]');
        const mediumEl = card.querySelector('[class*="medium"], [class*="software"]');
        const likesEl = card.querySelector('[class*="likes"], [class*="like-count"]');
        const viewsEl = card.querySelector('[class*="views"], [class*="view-count"]');

        results.push({
          title: titleEl ? titleEl.innerText.trim() : "",
          artist_name: artistEl ? artistEl.innerText.trim() : "",
          medium: mediumEl ? mediumEl.innerText.trim() : "",
          num_likes: likesEl ? likesEl.innerText.trim() : "0",
          num_views: viewsEl ? viewsEl.innerText.trim() : "0",
          tags: "",
        });
      }
      return results;
    }, CFG.maxResults);

    recorder.record("extract", {
      instruction: "Extract artwork cards",
      description: `Extracted ${artworks.length} artworks`,
      results: artworks,
    });

    console.log("\n" + "=".repeat(60));
    console.log(`ArtStation: ${CFG.searchQuery}`);
    console.log("=".repeat(60));
    artworks.forEach((a, i) => {
      console.log(`\n  ${i + 1}. ${a.title}`);
      console.log(`     Artist: ${a.artist_name}`);
      if (a.medium) console.log(`     Medium: ${a.medium}`);
      console.log(`     Likes: ${a.num_likes}  Views: ${a.num_views}`);
      if (a.tags) console.log(`     Tags: ${a.tags}`);
    });

    // ── Save ───────────────────────────────────────────────────────────
    const outDir = path.join(__dirname);
    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(outDir, "artstation_search.py"), pyCode);
    console.log("\n✅ Saved artstation_search.py");

    fs.writeFileSync(
      path.join(outDir, "recorded_actions.json"),
      JSON.stringify(recorder.actions, null, 2)
    );
    console.log("✅ Saved recorded_actions.json");
  } catch (err) {
    console.error("❌ Error:", err);
  } finally {
    await stagehand.close();
  }
})();
