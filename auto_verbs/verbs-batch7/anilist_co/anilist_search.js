const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * AniList – Anime Search
 *
 * Searches anilist.co for an anime title and extracts details:
 * title, average score, episodes, status, genres, description.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  animeTitle: "Fullmetal Alchemist",
  waits: { page: 6000, action: 2000 },
};

// ── Python Script Generator ──────────────────────────────────────────────────
function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
AniList – Anime Search
Anime: "${cfg.animeTitle}"

Generated on: ${ts}
Recorded ${n} browser interactions

Uses CDP-launched Chrome to avoid bot detection.
"""

import os, sys, shutil
from dataclasses import dataclass
from urllib.parse import quote_plus
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class AnimeSearchRequest:
    anime_title: str = "${cfg.animeTitle}"


@dataclass
class AnimeSearchResult:
    title: str = ""
    avg_score: str = ""
    episodes: str = ""
    status: str = ""
    genres: str = ""
    description: str = ""


def anilist_search(page: Page, request: AnimeSearchRequest) -> AnimeSearchResult:
    """Search AniList for an anime and extract its details."""
    print(f"  Anime: {request.anime_title}\\n")

    # ── Navigate to search page ───────────────────────────────────────
    query = quote_plus(request.anime_title)
    url = f"https://anilist.co/search/anime?search={query}"
    print(f"Loading {url}...")
    checkpoint("Navigate to AniList search")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(${cfg.waits.page})

    result = AnimeSearchResult()

    # ── Click the first search result ─────────────────────────────────
    checkpoint("Click first anime result")
    links = page.evaluate("""() => {
        const results = [];
        document.querySelectorAll('a[href*="/anime/"]').forEach(a => {
            const href = a.getAttribute('href');
            if (href && /\\\\/anime\\\\/\\\\d+/.test(href)) {
                results.push(href);
            }
        });
        // deduplicate
        return [...new Set(results)];
    }""")

    if not links:
        print("  No search results found")
        return result

    page.click(f'a[href="{links[0]}"]')
    page.wait_for_timeout(4000)

    # ── Extract title ─────────────────────────────────────────────────
    checkpoint("Extract anime details")
    try:
        result.title = page.locator("h1").first.inner_text().strip()
    except Exception:
        pass

    # ── Extract description ───────────────────────────────────────────
    try:
        desc = page.evaluate("""() => {
            const ps = document.querySelectorAll('p.description, .description p, [class*="description"]');
            for (const p of ps) {
                const t = p.innerText.trim();
                if (t.length > 50) return t;
            }
            return '';
        }""")
        result.description = desc[:500] if desc else ""
    except Exception:
        pass

    # ── Extract structured data from data-sets ────────────────────────
    try:
        data = page.evaluate("""() => {
            const info = {};
            document.querySelectorAll('.data-set').forEach(el => {
                const label = el.querySelector('.type');
                const value = el.querySelector('.value');
                if (label && value) {
                    info[label.innerText.trim()] = value.innerText.trim();
                }
            });
            return info;
        }""")
        result.avg_score = data.get("Average Score", "")
        result.episodes = data.get("Episodes", "")
        result.status = data.get("Status", "")
        result.genres = data.get("Genres", "")
    except Exception:
        pass

    # ── Print results ─────────────────────────────────────────────────
    print(f"  Title:       {result.title}")
    print(f"  Avg Score:   {result.avg_score}")
    print(f"  Episodes:    {result.episodes}")
    print(f"  Status:      {result.status}")
    print(f"  Genres:      {result.genres}")
    print(f"  Description: {result.description[:100]}...")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("anilist")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            request = AnimeSearchRequest()
            result = anilist_search(page, request)
            print("\\n=== DONE ===")
            print(f"Title:       {result.title}")
            print(f"Avg Score:   {result.avg_score}")
            print(f"Episodes:    {result.episodes}")
            print(f"Status:      {result.status}")
            print(f"Genres:      {result.genres}")
            print(f"Description: {result.description[:200]}")
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
    llmClient,
    headless: false,
  });
  await stagehand.init();
  const recorder = new PlaywrightRecorder(stagehand.page);
  const page = stagehand.page;

  try {
    // 1. Navigate to AniList search
    const query = encodeURIComponent(CFG.animeTitle);
    const url = `https://anilist.co/search/anime?search=${query}`;
    console.log(`Navigating to ${url}`);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(CFG.waits.page);

    // 2. Extract search result details via Stagehand
    const result = await stagehand.extract({
      instruction: `Find the first anime search result and extract: title, score percentage, number of episodes, format, and genres`,
      schema: {
        type: "object",
        properties: {
          title: { type: "string" },
          score: { type: "string" },
          episodes: { type: "string" },
          format: { type: "string" },
          genres: { type: "string" },
        },
      },
    });
    console.log("Extracted:", JSON.stringify(result, null, 2));

    // 3. Save outputs
    const outDir = path.dirname(__filename || __dirname);
    fs.writeFileSync(
      path.join(outDir, "recorded_actions.json"),
      JSON.stringify(recorder.actions, null, 2)
    );
    fs.writeFileSync(path.join(outDir, "anilist_search.py"), genPython(CFG, recorder));
    console.log("Saved recorded_actions.json and anilist_search.py");
  } finally {
    await stagehand.close();
  }
})();
