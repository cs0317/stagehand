const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Axios – Search for news articles by keyword
 */

const CFG = {
  searchQuery: "artificial intelligence",
  maxResults: 5,
  waits: { page: 5000, action: 2000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Axios – Search for news articles by keyword

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
class AxiosSearchRequest:
    search_query: str = "${cfg.searchQuery}"
    max_results: int = ${cfg.maxResults}


@dataclass
class AxiosArticleItem:
    title: str = ""
    author: str = ""
    publish_date: str = ""
    category: str = ""
    summary: str = ""


@dataclass
class AxiosSearchResult:
    items: List[AxiosArticleItem] = field(default_factory=list)


# Search for news articles on Axios by keyword.
def axios_search(page: Page, request: AxiosSearchRequest) -> AxiosSearchResult:
    """Search for news articles on Axios."""
    print(f"  Query: {request.search_query}\\n")

    query = request.search_query.replace(" ", "+")
    url = f"https://www.axios.com/results?q={query}"
    print(f"Loading {url}...")
    checkpoint("Navigate to Axios search results")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    result = AxiosSearchResult()

    checkpoint("Extract article listings")
    js_code = """(max) => {
        const cards = document.querySelectorAll('article, [data-cy="search-result"], [class*="SearchResult"], [class*="story"], [class*="Card"]');
        const items = [];
        for (const card of cards) {
            if (items.length >= max) break;
            const titleEl = card.querySelector('h2, h3, [class*="title"], [class*="headline"] a');
            const authorEl = card.querySelector('[class*="author"], [class*="byline"], [rel="author"]');
            const dateEl = card.querySelector('time, [class*="date"], [class*="time"]');
            const categoryEl = card.querySelector('[class*="category"], [class*="topic"], [class*="label"]');
            const summaryEl = card.querySelector('p, [class*="description"], [class*="summary"], [class*="excerpt"]');

            const title = titleEl ? titleEl.textContent.trim() : '';
            const author = authorEl ? authorEl.textContent.trim() : '';
            const publish_date = dateEl ? (dateEl.getAttribute('datetime') || dateEl.textContent.trim()) : '';
            const category = categoryEl ? categoryEl.textContent.trim() : '';
            const summary = summaryEl ? summaryEl.textContent.trim() : '';

            if (title) {
                items.push({title, author, publish_date, category, summary});
            }
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = AxiosArticleItem()
        item.title = d.get("title", "")
        item.author = d.get("author", "")
        item.publish_date = d.get("publish_date", "")
        item.category = d.get("category", "")
        item.summary = d.get("summary", "")
        result.items.append(item)

    for i, item in enumerate(result.items, 1):
        print(f"\\n  Article {i}:")
        print(f"    Title:    {item.title}")
        print(f"    Author:   {item.author}")
        print(f"    Date:     {item.publish_date}")
        print(f"    Category: {item.category}")
        print(f"    Summary:  {item.summary[:100]}...")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("axios")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            request = AxiosSearchRequest()
            result = axios_search(page, request)
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
    const url = `https://www.axios.com/results?q=${query}`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    recorder.record("navigate", url, `Navigate to ${url}`);
    await page.waitForTimeout(CFG.waits.page);

    const data = await stagehand.extract(
      `Extract the first ${CFG.maxResults} news article results. For each get the title, author, publish date, category, and summary.`
    );
    recorder.record("extract", "article listings", JSON.stringify(data));
    console.log("Extracted:", JSON.stringify(data, null, 2));

    const outDir = __dirname;
    fs.writeFileSync(path.join(outDir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    fs.writeFileSync(path.join(outDir, "axios_search.py"), genPython(CFG, recorder));
    console.log("Saved axios_search.py");
  } finally {
    await stagehand.close();
  }
})();
