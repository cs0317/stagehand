const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * BeerAdvocate – Beer Style Search
 *
 * Navigates to a BeerAdvocate beer style page and extracts top beers:
 * beer name, brewery, ABV, rating, number of reviews.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  beerStyle: "stout",
  styleId: 157,
  maxBeers: 5,
  waits: { page: 5000, action: 2000 },
};

// ── Python Script Generator ──────────────────────────────────────────────────
function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
BeerAdvocate – Beer Style Search
Style: "${cfg.beerStyle}" (ID: ${cfg.styleId})

Generated on: ${ts}
Recorded ${n} browser interactions

Uses CDP-launched Chrome to avoid bot detection.
"""

import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class BeerSearchRequest:
    beer_style: str = "${cfg.beerStyle}"
    style_id: int = ${cfg.styleId}
    max_beers: int = ${cfg.maxBeers}


@dataclass
class Beer:
    beer_name: str = ""
    brewery: str = ""
    style: str = ""
    abv: str = ""
    rating_score: str = ""
    num_reviews: str = ""


@dataclass
class BeerSearchResult:
    beers: List[Beer] = field(default_factory=list)


def beeradvocate_search(page: Page, request: BeerSearchRequest) -> BeerSearchResult:
    """Search BeerAdvocate for top beers of a given style."""
    print(f"  Style: {request.beer_style}\\n")

    # ── Navigate to style page ────────────────────────────────────────
    url = f"https://www.beeradvocate.com/beer/styles/{request.style_id}/"
    print(f"Loading {url}...")
    checkpoint("Navigate to BeerAdvocate style page")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(${cfg.waits.page})

    result = BeerSearchResult()

    # ── Extract style name from page title ────────────────────────────
    style_name = page.title().replace(" | BeerAdvocate", "").strip()

    # ── Extract beer rows from the table ──────────────────────────────
    checkpoint("Extract beer list")
    beers_data = page.evaluate("""(maxBeers) => {
        const results = [];
        // The beer list is in #ba-content, rows are in a table-like structure
        // Each beer has: name link, brewery link, ABV, ratings count, avg score, last active
        const links = document.querySelectorAll('#ba-content a[href*="/beer/profile/"]');
        let i = 0;
        while (i < links.length && results.length < maxBeers) {
            const nameLink = links[i];
            const name = nameLink.innerText.trim();
            // Skip empty or non-beer links
            if (!name || name.length < 2) { i++; continue; }
            // Next link should be the brewery
            const breweryLink = links[i + 1];
            const brewery = breweryLink ? breweryLink.innerText.trim() : '';
            // Get the parent row text to extract ABV, ratings, avg
            const row = nameLink.closest('tr') || nameLink.parentElement;
            const rowText = row ? row.innerText : '';
            // Parse row text: "Name\\nBrewery\\tABV\\tRatings\\tAvg\\tLast Active"
            const parts = rowText.split('\\t').map(s => s.trim());
            // ABV is usually the first numeric-looking part after brewery
            let abv = '', ratings = '', avg = '';
            for (const p of parts) {
                if (/^\\d+\\.\\d+$/.test(p) && !abv) abv = p + '%';
                else if (/^[\\d,]+$/.test(p.replace(/,/g, '')) && !ratings) ratings = p;
                else if (/^\\d+\\.\\d+$/.test(p) && abv) avg = p;
            }
            results.push({name, brewery, abv, ratings, avg});
            i += 2; // skip brewery link
        }
        return results;
    }""", request.max_beers)

    for bd in beers_data:
        beer = Beer()
        beer.beer_name = bd.get("name", "")
        beer.brewery = bd.get("brewery", "")
        beer.style = style_name
        beer.abv = bd.get("abv", "")
        beer.rating_score = bd.get("avg", "")
        beer.num_reviews = bd.get("ratings", "")
        result.beers.append(beer)

    # ── Print results ─────────────────────────────────────────────────
    for i, b in enumerate(result.beers, 1):
        print(f"\\n  Beer {i}:")
        print(f"    Name:    {b.beer_name}")
        print(f"    Brewery: {b.brewery}")
        print(f"    Style:   {b.style}")
        print(f"    ABV:     {b.abv}")
        print(f"    Rating:  {b.rating_score}")
        print(f"    Reviews: {b.num_reviews}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("beeradvocate")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            request = BeerSearchRequest()
            result = beeradvocate_search(page, request)
            print("\\n=== DONE ===")
            print(f"Found {len(result.beers)} beers")
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
    const url = `https://www.beeradvocate.com/beer/styles/${CFG.styleId}/`;
    console.log(`Navigating to ${url}`);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(CFG.waits.page);

    const result = await stagehand.extract({
      instruction: `Extract the top ${CFG.maxBeers} beers from this style page. For each beer get: name, brewery, ABV percentage, number of ratings/reviews, and average score.`,
      schema: {
        type: "object",
        properties: {
          beers: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                brewery: { type: "string" },
                abv: { type: "string" },
                ratings: { type: "string" },
                avg: { type: "string" },
              },
            },
          },
        },
      },
    });
    console.log("Extracted:", JSON.stringify(result, null, 2));

    const outDir = path.dirname(__filename || __dirname);
    fs.writeFileSync(
      path.join(outDir, "recorded_actions.json"),
      JSON.stringify(recorder.actions, null, 2)
    );
    fs.writeFileSync(path.join(outDir, "beeradvocate_search.py"), genPython(CFG, recorder));
    console.log("Saved recorded_actions.json and beeradvocate_search.py");
  } finally {
    await stagehand.close();
  }
})();
