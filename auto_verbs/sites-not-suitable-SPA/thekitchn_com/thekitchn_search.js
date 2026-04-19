const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * The Kitchn – Search for recipes and kitchen tips by keyword
 */

const CFG = {
  searchQuery: "chocolate chip cookies",
  maxResults: 5,
  waits: { page: 5000, action: 2000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
The Kitchn – Search for recipes and kitchen tips by keyword

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
class ThekitchnSearchRequest:
    search_query: str = "${cfg.searchQuery}"
    max_results: int = ${cfg.maxResults}


@dataclass
class ThekitchnArticleItem:
    title: str = ""
    author: str = ""
    category: str = ""
    summary: str = ""
    image_url: str = ""


@dataclass
class ThekitchnSearchResult:
    items: List[ThekitchnArticleItem] = field(default_factory=list)


# Search for recipes and kitchen tips on The Kitchn by keyword.
def thekitchn_search(page: Page, request: ThekitchnSearchRequest) -> ThekitchnSearchResult:
    """Search for recipes and kitchen tips on The Kitchn."""
    print(f"  Query: {request.search_query}\\n")

    query = request.search_query.replace(" ", "+")
    url = f"https://www.thekitchn.com/search?q={query}"
    print(f"Loading {url}...")
    checkpoint("Navigate to The Kitchn search results")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    result = ThekitchnSearchResult()

    checkpoint("Extract article listings")
    js_code = """(max) => {
        const cards = document.querySelectorAll('article, [class*="SearchResult"], [class*="search-result"], [class*="Card"], [class*="post"]');
        const items = [];
        for (const card of cards) {
            if (items.length >= max) break;
            const titleEl = card.querySelector('h2, h3, [class*="title"], [class*="headline"] a');
            const authorEl = card.querySelector('[class*="author"], [class*="byline"], [rel="author"]');
            const categoryEl = card.querySelector('[class*="category"], [class*="topic"], [class*="label"], [class*="tag"]');
            const summaryEl = card.querySelector('p, [class*="description"], [class*="summary"], [class*="excerpt"]');
            const imgEl = card.querySelector('img');

            const title = titleEl ? titleEl.textContent.trim() : '';
            const author = authorEl ? authorEl.textContent.trim() : '';
            const category = categoryEl ? categoryEl.textContent.trim() : '';
            const summary = summaryEl ? summaryEl.textContent.trim() : '';
            const image_url = imgEl ? (imgEl.getAttribute('src') || imgEl.getAttribute('data-src') || '') : '';

            if (title) {
                items.push({title, author, category, summary, image_url});
            }
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = ThekitchnArticleItem()
        item.title = d.get("title", "")
        item.author = d.get("author", "")
        item.category = d.get("category", "")
        item.summary = d.get("summary", "")
        item.image_url = d.get("image_url", "")
        result.items.append(item)

    for i, item in enumerate(result.items, 1):
        print(f"\\n  Article {i}:")
        print(f"    Title:    {item.title}")
        print(f"    Author:   {item.author}")
        print(f"    Category: {item.category}")
        print(f"    Summary:  {item.summary[:100]}...")
        print(f"    Image:    {item.image_url[:80]}...")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("thekitchn")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            request = ThekitchnSearchRequest()
            result = thekitchn_search(page, request)
            print("\\n=== DONE ===")
            print(f"Found {len(result.items)} articles")
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
    const url = `https://www.thekitchn.com/search?q=${query}`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    recorder.record("navigate", url, `Navigate to ${url}`);
    await page.waitForTimeout(CFG.waits.page);

    const data = await stagehand.extract(
      `Extract the first ${CFG.maxResults} article results. For each get the title, author, category, summary, and image URL.`
    );
    recorder.record("extract", "article listings", JSON.stringify(data));
    console.log("Extracted:", JSON.stringify(data, null, 2));

    const outDir = __dirname;
    fs.writeFileSync(path.join(outDir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    fs.writeFileSync(path.join(outDir, "thekitchn_search.py"), genPython(CFG, recorder));
    console.log("Saved thekitchn_search.py");
  } finally {
    await stagehand.close();
  }
})();
