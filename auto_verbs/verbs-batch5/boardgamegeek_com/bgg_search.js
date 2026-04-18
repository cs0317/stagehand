const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient, observeAndAct } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * boardgamegeek.com – Board Game Search
 *
 * Searches boardgamegeek.com for board games matching a query,
 * extracts results from the collection_table, records interactions
 * and generates a Python Playwright script.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  url: "https://boardgamegeek.com",
  searchQuery: "cooperative",
  maxResults: 5,
  waits: { page: 8000 },
};

// ── Python Script Generator ──────────────────────────────────────────────────
function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
boardgamegeek.com – Board Game Search
Query: ${cfg.searchQuery}

Generated on: ${ts}
Recorded ${n} browser interactions

Uses Playwright's native locator API with the user's Chrome profile.
"""

import re
import os, sys, shutil
from dataclasses import dataclass
from playwright.sync_api import Playwright, sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class BGGSearchRequest:
    search_query: str = "${cfg.searchQuery}"
    max_results: int = ${cfg.maxResults}


@dataclass(frozen=True)
class BGGResult:
    game_name: str = ""
    year_published: str = ""
    geek_rating: str = ""
    avg_rating: str = ""
    num_voters: str = ""


@dataclass(frozen=True)
class BGGSearchResult:
    games: list = None  # list[BGGResult]


def bgg_search(page: Page, request: BGGSearchRequest) -> BGGSearchResult:
    """Search boardgamegeek.com for board games."""
    search_query = request.search_query
    max_results = request.max_results
    print(f"  Query: {search_query}")
    print(f"  Max results: {max_results}\\n")

    # ── Navigate to search results page ───────────────────────────────
    query_encoded = search_query.replace(" ", "+")
    url = f"https://boardgamegeek.com/geeksearch.php?action=search&objecttype=boardgame&q={query_encoded}"
    print(f"Loading {url}...")
    checkpoint("Navigate to BGG search page")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(8000)
    print(f"  Loaded: {page.url}")

    # ── Extract results from the collection table ─────────────────────
    checkpoint("Extract games from search results table")
    results_data = page.evaluate(r"""(maxResults) => {
        const table = document.querySelector('table.collection_table');
        if (!table) return [];
        const rows = table.querySelectorAll('tr');
        const results = [];
        for (const row of rows) {
            if (results.length >= maxResults) break;
            const cells = row.querySelectorAll('td');
            if (cells.length < 6) continue;

            // Cell 2: title cell with game name and year
            const titleText = (cells[2].innerText || '').trim();
            const nameMatch = titleText.match(/^(.+?)\\s*\\((\\d{4})\\)/);
            if (!nameMatch) continue;
            const gameName = nameMatch[1].trim();
            const year = nameMatch[2];

            // Cells 3-5: ratings and voters
            const geekRating = (cells[3].innerText || '').trim();
            const avgRating = (cells[4].innerText || '').trim();
            const numVoters = (cells[5].innerText || '').trim();

            // Skip entries with no meaningful data
            if (geekRating === 'N/A' && avgRating === 'N/A' && numVoters === 'N/A') continue;

            results.push({ gameName, year, geekRating, avgRating, numVoters });
        }
        return results;
    }""", max_results)

    games = []
    for r in results_data:
        games.append(BGGResult(
            game_name=r.get("gameName", ""),
            year_published=r.get("year", ""),
            geek_rating=r.get("geekRating", "N/A"),
            avg_rating=r.get("avgRating", "N/A"),
            num_voters=r.get("numVoters", "N/A"),
        ))

    # ── Print results ─────────────────────────────────────────────────
    print("=" * 60)
    print(f'boardgamegeek.com - Search Results for "{search_query}"')
    print("=" * 60)
    for idx, g in enumerate(games, 1):
        print(f"\\n{idx}. {g.game_name} ({g.year_published})")
        print(f"   Geek Rating: {g.geek_rating}")
        print(f"   Avg Rating: {g.avg_rating}")
        print(f"   Num Voters: {g.num_voters}")

    print(f"\\nFound {len(games)} games")
    return BGGSearchResult(games=games)


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("boardgamegeek_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = bgg_search(page, BGGSearchRequest())
            print(f"\\nReturned {len(result.games or [])} games")
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
      args: [
        "--disable-blink-features=AutomationControlled",
        "--start-maximized",
      ],
    },
  });
  await stagehand.init();
  const page = stagehand.context.pages()[0];
  const recorder = new PlaywrightRecorder();

  try {
    // ── Navigate to BGG search ─────────────────────────────────────
    const queryEncoded = CFG.searchQuery.replace(/ /g, "+");
    const url = `${CFG.url}/geeksearch.php?action=search&objecttype=boardgame&q=${queryEncoded}`;
    console.log(`\n🌐 Navigating to ${url}...`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url, description: `Search BGG for "${CFG.searchQuery}"` });
    console.log(`   Loaded: ${page.url()}`);

    // ── Extract results from the collection table ──────────────────
    console.log(`\n🎯 Extracting up to ${CFG.maxResults} results...\n`);

    const results = await page.evaluate((maxResults) => {
      const table = document.querySelector("table.collection_table");
      if (!table) return [];
      const rows = table.querySelectorAll("tr");
      const items = [];
      for (const row of rows) {
        if (items.length >= maxResults) break;
        const cells = row.querySelectorAll("td");
        if (cells.length < 6) continue;

        const titleText = (cells[2].innerText || "").trim();
        const nameMatch = titleText.match(/^(.+?)\s*\((\d{4})\)/);
        if (!nameMatch) continue;
        const gameName = nameMatch[1].trim();
        const year = nameMatch[2];

        const geekRating = (cells[3].innerText || "").trim();
        const avgRating = (cells[4].innerText || "").trim();
        const numVoters = (cells[5].innerText || "").trim();

        if (geekRating === "N/A" && avgRating === "N/A" && numVoters === "N/A") continue;

        items.push({ gameName, year, geekRating, avgRating, numVoters });
      }
      return items;
    }, CFG.maxResults);

    recorder.record("extract", {
      instruction: "Extract games from search results table",
      description: `Extracted ${results.length} games from collection_table`,
      results,
    });

    console.log(`📋 Found ${results.length} games:\n`);
    results.forEach((r, i) => {
      console.log(`   ${i + 1}. ${r.gameName} (${r.year})`);
      console.log(`      Geek: ${r.geekRating} | Avg: ${r.avgRating} | Voters: ${r.numVoters}`);
    });

    // ── Save outputs ───────────────────────────────────────────────
    const dir = path.join(__dirname);

    const actionsFile = path.join(dir, "recorded_actions.json");
    fs.writeFileSync(actionsFile, JSON.stringify(recorder.actions, null, 2));
    console.log(`\n💾 Saved ${recorder.actions.length} actions → ${actionsFile}`);

    const pyFile = path.join(dir, "bgg_search.py");
    fs.writeFileSync(pyFile, genPython(CFG, recorder));
    console.log(`🐍 Saved Python script → ${pyFile}`);

  } catch (err) {
    console.error("❌ Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
