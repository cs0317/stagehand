const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Spotify – Search Podcasts
 *
 * Searches open.spotify.com for podcasts and extracts podcast name,
 * publisher, description, and rating.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  query: "true crime",
  maxPodcasts: 5,
  waits: { page: 8000, detail: 5000 },
};

// ── Python Script Generator ──────────────────────────────────────────────────
function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Spotify – Search Podcasts
Query: "${cfg.query}"

Generated on: ${ts}
Recorded ${n} browser interactions

Uses Playwright's native locator API with the user's Chrome profile.
"""

import re
import os, sys, shutil
from dataclasses import dataclass, field
from urllib.parse import quote
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class SpotifyRequest:
    query: str = "${cfg.query}"
    max_podcasts: int = ${cfg.maxPodcasts}


@dataclass
class Podcast:
    name: str = ""
    publisher: str = ""
    description: str = ""
    rating: str = ""


@dataclass
class SpotifyResult:
    podcasts: list = field(default_factory=list)


def spotify_podcasts(page: Page, request: SpotifyRequest) -> SpotifyResult:
    """Search Spotify for podcasts."""
    print(f"  Query: {request.query}\\n")

    # ── Search ────────────────────────────────────────────────────────
    search_url = f"https://open.spotify.com/search/{quote(request.query)}/podcasts"
    print(f"Loading {search_url}...")
    checkpoint("Navigate to Spotify podcast search")
    page.goto(search_url, wait_until="domcontentloaded")
    page.wait_for_timeout(8000)

    # ── Extract podcast cards ─────────────────────────────────────────
    cards = page.evaluate(r"""(maxPodcasts) => {
        const cardEls = document.querySelectorAll('[data-testid*="card"]');
        const results = [];
        for (const card of cardEls) {
            if (results.length >= maxPodcasts) break;
            const link = card.querySelector('a[href*="/show/"]');
            if (!link) continue;
            const text = card.innerText.trim();
            const lines = text.split('\\n').filter(l => l.trim());
            results.push({
                name: lines[0] || '',
                publisher: lines[1] || '',
                url: link.href,
            });
        }
        return results;
    }""", request.max_podcasts)

    # ── Visit each podcast page for details ───────────────────────────
    podcasts = []
    for card in cards:
        print(f"  Checking: {card['name']}...")
        checkpoint(f"Visit podcast: {card['name']}")
        page.goto(card['url'], wait_until="domcontentloaded")
        page.wait_for_timeout(5000)

        detail = page.evaluate(r"""() => {
            const text = document.body.innerText;

            // Description: between "About\\n" and ratings/episodes
            let desc = '';
            const aboutIdx = text.indexOf('About\\n');
            if (aboutIdx >= 0) {
                const afterAbout = text.substring(aboutIdx + 6, aboutIdx + 600).trim();
                // Take text until "Show more" or rating pattern
                const endMatch = afterAbout.match(/(?:\\n\\d+\\.\\d+\\n|… Show more|\\nAll Episodes)/);
                desc = endMatch ? afterAbout.substring(0, endMatch.index).trim() : afterAbout.substring(0, 200).trim();
            }

            // Rating
            let rating = '';
            const ratingMatch = text.match(/(\\d+\\.\\d+)\\n\\((\\d[\\d.]*K?)\\)/);
            if (ratingMatch) rating = ratingMatch[1];

            return { description: desc, rating };
        }""")

        podcasts.append({
            'name': card['name'],
            'publisher': card['publisher'],
            'description': detail['description'],
            'rating': detail['rating'],
        })

    # ── Print results ─────────────────────────────────────────────────
    print("\\n" + "=" * 60)
    print(f"Spotify podcasts: {request.query}")
    print("=" * 60)
    for idx, p in enumerate(podcasts, 1):
        print(f"\\n  {idx}. {p['name']}")
        print(f"     Publisher: {p['publisher']}")
        if p['rating']:
            print(f"     Rating: {p['rating']}")
        if p['description']:
            desc = p['description'][:120] + "..." if len(p['description']) > 120 else p['description']
            print(f"     Description: {desc}")

    return SpotifyResult(podcasts=[Podcast(**p) for p in podcasts])


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("spotify_podcasts")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = spotify_podcasts(page, SpotifyRequest())
            print(f"\\nReturned {len(result.podcasts)} podcasts")
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
    const searchUrl = `https://open.spotify.com/search/${encodeURIComponent(CFG.query)}/podcasts`;
    console.log(`\n🌐 Searching: ${searchUrl}...`);
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url: searchUrl, description: "Search Spotify podcasts" });

    // Get podcast cards from search
    const cards = await page.evaluate((maxPodcasts) => {
      const cardEls = document.querySelectorAll('[data-testid*="card"]');
      const results = [];
      for (const card of cardEls) {
        if (results.length >= maxPodcasts) break;
        const link = card.querySelector('a[href*="/show/"]');
        if (!link) continue;
        const text = card.innerText.trim();
        const lines = text.split("\n").filter(l => l.trim());
        results.push({
          name: lines[0] || "",
          publisher: lines[1] || "",
          url: link.href,
        });
      }
      return results;
    }, CFG.maxPodcasts);

    console.log(`Found ${cards.length} podcasts`);

    // Visit each podcast page for details
    const podcasts = [];
    for (const card of cards) {
      console.log(`  📻 ${card.name}...`);
      await page.goto(card.url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(CFG.waits.detail);

      const detail = await page.evaluate(() => {
        const text = document.body.innerText;

        let desc = "";
        const aboutIdx = text.indexOf("About\n");
        if (aboutIdx >= 0) {
          const afterAbout = text.substring(aboutIdx + 6, aboutIdx + 600).trim();
          const endMatch = afterAbout.match(/(?:\n\d+\.\d+\n|… Show more|\nAll Episodes)/);
          desc = endMatch ? afterAbout.substring(0, endMatch.index).trim() : afterAbout.substring(0, 200).trim();
        }

        let rating = "";
        const ratingMatch = text.match(/(\d+\.\d+)\n\((\d[\d.]*K?)\)/);
        if (ratingMatch) rating = ratingMatch[1];

        return { description: desc, rating };
      });

      podcasts.push({
        name: card.name,
        publisher: card.publisher,
        description: detail.description,
        rating: detail.rating,
      });

      recorder.record("extract", {
        instruction: `Extract details for ${card.name}`,
        description: `Rating: ${detail.rating}`,
      });
    }

    console.log("\n" + "=".repeat(60));
    console.log(`Spotify podcasts: ${CFG.query}`);
    console.log("=".repeat(60));
    podcasts.forEach((p, i) => {
      console.log(`\n  ${i + 1}. ${p.name}`);
      console.log(`     Publisher: ${p.publisher}`);
      if (p.rating) console.log(`     Rating: ${p.rating}`);
      if (p.description) {
        const desc = p.description.length > 120 ? p.description.substring(0, 120) + "..." : p.description;
        console.log(`     Description: ${desc}`);
      }
    });

    const dir = path.join(__dirname);
    fs.writeFileSync(
      path.join(dir, "recorded_actions.json"),
      JSON.stringify(recorder.actions, null, 2)
    );
    console.log(`\n💾 Saved ${recorder.actions.length} actions`);

    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(dir, "spotify_podcasts.py"), pyCode);
    console.log("🐍 Saved Python script");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
