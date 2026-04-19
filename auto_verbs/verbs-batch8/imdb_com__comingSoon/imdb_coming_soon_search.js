const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * IMDb – Browse upcoming movie releases
 */

const CFG = {
  maxResults: 10,
  waits: { page: 5000, action: 2000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
IMDb – Browse upcoming movie releases

Generated on: ${ts}
Recorded ${n} browser interactions
"""

import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class ImdbComingSoonSearchRequest:
    max_results: int = ${cfg.maxResults}


@dataclass
class ImdbComingSoonItem:
    movie_title: str = ""
    release_date: str = ""
    genres: str = ""
    stars: str = ""
    director: str = ""
    synopsis: str = ""


@dataclass
class ImdbComingSoonSearchResult:
    items: List[ImdbComingSoonItem] = field(default_factory=list)


# Browse upcoming movie releases on IMDb.
def imdb_coming_soon_search(page: Page, request: ImdbComingSoonSearchRequest) -> ImdbComingSoonSearchResult:
    """Browse upcoming movie releases on IMDb."""
    print(f"  Max results: {request.max_results}\\n")

    url = "https://www.imdb.com/calendar/"
    print(f"Loading {url}...")
    checkpoint("Navigate to IMDb coming soon page")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    result = ImdbComingSoonSearchResult()

    checkpoint("Extract upcoming movie listings")
    js_code = """(max) => {
        const cards = document.querySelectorAll('[class*="ipc-metadata-list-summary-item"], [class*="upcoming"], [class*="release"], article, [class*="list-item"], li[class*="Item"]');
        const items = [];
        for (const card of cards) {
            if (items.length >= max) break;
            const titleEl = card.querySelector('a[class*="title"], h3, h4, [class*="title"], [class*="Title"]');
            const dateEl = card.querySelector('[class*="date"], [class*="Date"], time, [class*="release"]');
            const genreEl = card.querySelector('[class*="genre"], [class*="Genre"], [class*="tag"], span[class*="genre"]');
            const starsEl = card.querySelector('[class*="star"], [class*="Star"], [class*="cast"], [class*="actor"]');
            const directorEl = card.querySelector('[class*="director"], [class*="Director"]');
            const synopsisEl = card.querySelector('[class*="synopsis"], [class*="description"], [class*="plot"], p');

            const movie_title = titleEl ? titleEl.textContent.trim() : '';
            const release_date = dateEl ? dateEl.textContent.trim() : '';
            const genres = genreEl ? genreEl.textContent.trim() : '';
            const stars = starsEl ? starsEl.textContent.trim() : '';
            const director = directorEl ? directorEl.textContent.trim() : '';
            const synopsis = synopsisEl ? synopsisEl.textContent.trim() : '';

            if (movie_title) {
                items.push({movie_title, release_date, genres, stars, director, synopsis});
            }
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = ImdbComingSoonItem()
        item.movie_title = d.get("movie_title", "")
        item.release_date = d.get("release_date", "")
        item.genres = d.get("genres", "")
        item.stars = d.get("stars", "")
        item.director = d.get("director", "")
        item.synopsis = d.get("synopsis", "")
        result.items.append(item)

    for i, item in enumerate(result.items, 1):
        print(f"\\n  Movie {i}:")
        print(f"    Title:    {item.movie_title}")
        print(f"    Release:  {item.release_date}")
        print(f"    Genres:   {item.genres}")
        print(f"    Stars:    {item.stars[:60]}")
        print(f"    Director: {item.director}")
        print(f"    Synopsis: {item.synopsis[:80]}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("imdb_coming_soon")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            request = ImdbComingSoonSearchRequest()
            result = imdb_coming_soon_search(page, request)
            print("\\n=== DONE ===")
            print(f"Found {len(result.items)} upcoming movies")
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
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder(stagehand.page);
  const page = stagehand.page;

  try {
    const url = "https://www.imdb.com/calendar/";
    await page.goto(url, { waitUntil: "domcontentloaded" });
    recorder.record("navigate", url, `Navigate to ${url}`);
    await page.waitForTimeout(CFG.waits.page);

    const data = await stagehand.extract(
      `Extract the first ${CFG.maxResults} upcoming movie releases. For each get the movie title, release date, genres, stars, director, and synopsis.`
    );
    recorder.record("extract", "upcoming movies", JSON.stringify(data));
    console.log("Extracted:", JSON.stringify(data, null, 2));

    const outDir = __dirname;
    fs.writeFileSync(path.join(outDir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    fs.writeFileSync(path.join(outDir, "imdb_coming_soon_search.py"), genPython(CFG, recorder));
    console.log("Saved imdb_coming_soon_search.py");
  } finally {
    await stagehand.close();
  }
})();
