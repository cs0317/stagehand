const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * DeviantArt – Search for artwork by keyword
 */

const CFG = {
  searchQuery: "digital painting",
  maxResults: 5,
  waits: { page: 5000, action: 2000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
DeviantArt – Search for artwork by keyword

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
class DeviantartSearchRequest:
    search_query: str = "${cfg.searchQuery}"
    max_results: int = ${cfg.maxResults}


@dataclass
class DeviantartArtworkItem:
    title: str = ""
    artist_name: str = ""
    num_favorites: str = ""
    num_comments: str = ""
    category: str = ""
    image_url: str = ""


@dataclass
class DeviantartSearchResult:
    items: List[DeviantartArtworkItem] = field(default_factory=list)


# Search for artwork on DeviantArt by keyword.
def deviantart_search(page: Page, request: DeviantartSearchRequest) -> DeviantartSearchResult:
    """Search for artwork on DeviantArt by keyword."""
    print(f"  Query: {request.search_query}\\n")

    query = request.search_query.replace(" ", "+")
    url = f"https://www.deviantart.com/search?q={query}"
    print(f"Loading {url}...")
    checkpoint("Navigate to DeviantArt search results")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    result = DeviantartSearchResult()

    checkpoint("Extract artwork listings")
    js_code = """(max) => {
        const cards = document.querySelectorAll('[data-hook="deviation_std_thumb"], [class*="deviation"], [class*="thumb"], [class*="browse-result"], a[href*="/art/"]');
        const items = [];
        const seen = new Set();
        for (const card of cards) {
            if (items.length >= max) break;
            const titleEl = card.querySelector('[class*="title"], [aria-label], img[alt]');
            const artistEl = card.querySelector('[class*="artist"], [class*="username"], [class*="user"] a, a[class*="user"]');
            const favEl = card.querySelector('[class*="fav"] span, [class*="favorite"] span, [class*="like"] span');
            const commentEl = card.querySelector('[class*="comment"] span');
            const categoryEl = card.querySelector('[class*="category"], [class*="tag"]');
            const imgEl = card.querySelector('img[src]');

            const title = titleEl ? (titleEl.getAttribute('aria-label') || titleEl.getAttribute('alt') || titleEl.textContent.trim()) : '';
            const artist_name = artistEl ? artistEl.textContent.trim() : '';
            const num_favorites = favEl ? favEl.textContent.trim() : '';
            const num_comments = commentEl ? commentEl.textContent.trim() : '';
            const category = categoryEl ? categoryEl.textContent.trim() : '';
            const image_url = imgEl ? imgEl.getAttribute('src') : '';

            if (title && !seen.has(title)) {
                seen.add(title);
                items.push({title, artist_name, num_favorites, num_comments, category, image_url});
            }
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = DeviantartArtworkItem()
        item.title = d.get("title", "")
        item.artist_name = d.get("artist_name", "")
        item.num_favorites = d.get("num_favorites", "")
        item.num_comments = d.get("num_comments", "")
        item.category = d.get("category", "")
        item.image_url = d.get("image_url", "")
        result.items.append(item)

    for i, item in enumerate(result.items, 1):
        print(f"\\n  Artwork {i}:")
        print(f"    Title:      {item.title}")
        print(f"    Artist:     {item.artist_name}")
        print(f"    Favorites:  {item.num_favorites}")
        print(f"    Comments:   {item.num_comments}")
        print(f"    Category:   {item.category}")
        print(f"    Image URL:  {item.image_url[:80]}...")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("deviantart")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            request = DeviantartSearchRequest()
            result = deviantart_search(page, request)
            print("\\n=== DONE ===")
            print(f"Found {len(result.items)} artworks")
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
    const url = `https://www.deviantart.com/search?q=${query}`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    recorder.record("navigate", url, `Navigate to ${url}`);
    await page.waitForTimeout(CFG.waits.page);

    const data = await stagehand.extract(
      `Extract the first ${CFG.maxResults} artwork results. For each get the title, artist name, number of favorites, number of comments, category, and image URL.`
    );
    recorder.record("extract", "artwork listings", JSON.stringify(data));
    console.log("Extracted:", JSON.stringify(data, null, 2));

    const outDir = __dirname;
    fs.writeFileSync(path.join(outDir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    fs.writeFileSync(path.join(outDir, "deviantart_search.py"), genPython(CFG, recorder));
    console.log("Saved deviantart_search.py");
  } finally {
    await stagehand.close();
  }
})();
