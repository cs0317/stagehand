const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Roadtrippers – Search for road trip stops and attractions by keyword
 */

const CFG = {
  searchQuery: "Route 66",
  maxResults: 5,
  waits: { page: 5000, action: 2000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Roadtrippers – Search for road trip stops and attractions by keyword

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
class RoadtrippersSearchRequest:
    search_query: str = "${cfg.searchQuery}"
    max_results: int = ${cfg.maxResults}


@dataclass
class RoadtrippersPlaceItem:
    place_name: str = ""
    category: str = ""
    location: str = ""
    rating: str = ""
    description: str = ""
    distance: str = ""


@dataclass
class RoadtrippersSearchResult:
    items: List[RoadtrippersPlaceItem] = field(default_factory=list)


# Search for road trip stops and attractions on Roadtrippers by keyword.
def roadtrippers_search(page: Page, request: RoadtrippersSearchRequest) -> RoadtrippersSearchResult:
    """Search for road trip stops and attractions on Roadtrippers."""
    print(f"  Query: {request.search_query}\\n")

    query = request.search_query.replace(" ", "+")
    url = f"https://roadtrippers.com/search?q={query}"
    print(f"Loading {url}...")
    checkpoint("Navigate to Roadtrippers search results")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    result = RoadtrippersSearchResult()

    checkpoint("Extract place listings")
    js_code = """(max) => {
        const cards = document.querySelectorAll('[class*="SearchResult"], [class*="search-result"], [class*="PlaceCard"], [class*="place-card"], [class*="Card"], article');
        const items = [];
        for (const card of cards) {
            if (items.length >= max) break;
            const nameEl = card.querySelector('h2, h3, h4, [class*="name"], [class*="title"]');
            const catEl = card.querySelector('[class*="category"], [class*="type"], [class*="label"]');
            const locEl = card.querySelector('[class*="location"], [class*="address"], [class*="city"]');
            const ratingEl = card.querySelector('[class*="rating"], [class*="score"], [class*="stars"]');
            const descEl = card.querySelector('p, [class*="description"], [class*="summary"], [class*="excerpt"]');
            const distEl = card.querySelector('[class*="distance"], [class*="miles"], [class*="dist"]');

            const place_name = nameEl ? nameEl.textContent.trim() : '';
            const category = catEl ? catEl.textContent.trim() : '';
            const location = locEl ? locEl.textContent.trim() : '';
            const rating = ratingEl ? ratingEl.textContent.trim() : '';
            const description = descEl ? descEl.textContent.trim() : '';
            const distance = distEl ? distEl.textContent.trim() : '';

            if (place_name) {
                items.push({place_name, category, location, rating, description, distance});
            }
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = RoadtrippersPlaceItem()
        item.place_name = d.get("place_name", "")
        item.category = d.get("category", "")
        item.location = d.get("location", "")
        item.rating = d.get("rating", "")
        item.description = d.get("description", "")
        item.distance = d.get("distance", "")
        result.items.append(item)

    for i, item in enumerate(result.items, 1):
        print(f"\\n  Place {i}:")
        print(f"    Name:        {item.place_name}")
        print(f"    Category:    {item.category}")
        print(f"    Location:    {item.location}")
        print(f"    Rating:      {item.rating}")
        print(f"    Description: {item.description[:100]}...")
        print(f"    Distance:    {item.distance}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("roadtrippers")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            request = RoadtrippersSearchRequest()
            result = roadtrippers_search(page, request)
            print("\\n=== DONE ===")
            print(f"Found {len(result.items)} places")
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
    const query = CFG.searchQuery.replace(/ /g, "+");
    const url = `https://roadtrippers.com/search?q=${query}`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    recorder.record("navigate", url, `Navigate to ${url}`);
    await page.waitForTimeout(CFG.waits.page);

    const data = await stagehand.extract(
      `Extract the first ${CFG.maxResults} place results. For each get the place name, category, location, rating, description, and distance.`
    );
    recorder.record("extract", "place listings", JSON.stringify(data));
    console.log("Extracted:", JSON.stringify(data, null, 2));

    const outDir = __dirname;
    fs.writeFileSync(path.join(outDir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    fs.writeFileSync(path.join(outDir, "roadtrippers_search.py"), genPython(CFG, recorder));
    console.log("Saved roadtrippers_search.py");
  } finally {
    await stagehand.close();
  }
})();
