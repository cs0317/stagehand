const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Bon Appetit – Search for recipes
 */

const CFG = {
  searchQuery: "pasta",
  maxResults: 5,
  waits: { page: 5000, action: 2000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Bon Appetit – Search for recipes

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
class BonAppetitSearchRequest:
    search_query: str = "${cfg.searchQuery}"
    max_results: int = ${cfg.maxResults}


@dataclass
class BonAppetitRecipeItem:
    recipe_name: str = ""
    author: str = ""
    rating: str = ""
    total_time: str = ""
    description: str = ""
    image_url: str = ""


@dataclass
class BonAppetitSearchResult:
    items: List[BonAppetitRecipeItem] = field(default_factory=list)


# Search for recipes on Bon Appetit.
def bonappetit_search(page: Page, request: BonAppetitSearchRequest) -> BonAppetitSearchResult:
    """Search for recipes on Bon Appetit."""
    print(f"  Query: {request.search_query}\\n")

    query = request.search_query.replace(" ", "+")
    url = f"https://www.bonappetit.com/search?q={query}"
    print(f"Loading {url}...")
    checkpoint("Navigate to Bon Appetit search results")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    result = BonAppetitSearchResult()

    checkpoint("Extract recipe listings")
    js_code = """(max) => {
        const cards = document.querySelectorAll('[class*="recipe-card"], [class*="SearchResult"], [class*="summary-item"], article[class*="card"]');
        const items = [];
        for (const card of cards) {
            if (items.length >= max) break;
            const nameEl = card.querySelector('h2, h3, [class*="hed"], [class*="title"] a');
            const authorEl = card.querySelector('[class*="byline"], [class*="author"], [class*="contributor"]');
            const ratingEl = card.querySelector('[class*="rating"], [class*="stars"]');
            const timeEl = card.querySelector('[class*="time"], [class*="duration"]');
            const descEl = card.querySelector('[class*="dek"], [class*="description"], p');
            const imgEl = card.querySelector('img');

            const recipe_name = nameEl ? nameEl.textContent.trim() : '';
            const author = authorEl ? authorEl.textContent.trim() : '';
            const rating = ratingEl ? ratingEl.textContent.trim() : '';
            const total_time = timeEl ? timeEl.textContent.trim() : '';
            const description = descEl ? descEl.textContent.trim() : '';
            const image_url = imgEl ? (imgEl.src || imgEl.getAttribute('data-src') || '') : '';

            if (recipe_name) {
                items.push({recipe_name, author, rating, total_time, description, image_url});
            }
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = BonAppetitRecipeItem()
        item.recipe_name = d.get("recipe_name", "")
        item.author = d.get("author", "")
        item.rating = d.get("rating", "")
        item.total_time = d.get("total_time", "")
        item.description = d.get("description", "")
        item.image_url = d.get("image_url", "")
        result.items.append(item)

    for i, item in enumerate(result.items, 1):
        print(f"\\n  Recipe {i}:")
        print(f"    Name:        {item.recipe_name}")
        print(f"    Author:      {item.author}")
        print(f"    Rating:      {item.rating}")
        print(f"    Time:        {item.total_time}")
        print(f"    Description: {item.description[:100]}...")
        print(f"    Image:       {item.image_url[:80]}...")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("bonappetit")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            request = BonAppetitSearchRequest()
            result = bonappetit_search(page, request)
            print("\\n=== DONE ===")
            print(f"Found {len(result.items)} recipes")
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
    const url = `https://www.bonappetit.com/search?q=${query}`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    recorder.record("navigate", url, `Navigate to ${url}`);
    await page.waitForTimeout(CFG.waits.page);

    const data = await stagehand.extract(
      `Extract the first ${CFG.maxResults} recipe results. For each get the recipe name, author, rating, total time, description, and image URL.`
    );
    recorder.record("extract", "recipe listings", JSON.stringify(data));
    console.log("Extracted:", JSON.stringify(data, null, 2));

    const outDir = __dirname;
    fs.writeFileSync(path.join(outDir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    fs.writeFileSync(path.join(outDir, "bonappetit_search.py"), genPython(CFG, recorder));
    console.log("Saved bonappetit_search.py");
  } finally {
    await stagehand.close();
  }
})();
