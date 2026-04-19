const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * FindLaw – Search for legal articles and information by keyword
 */

const CFG = {
  searchQuery: "tenant rights",
  maxResults: 5,
  waits: { page: 5000, action: 2000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
FindLaw – Search for legal articles and information by keyword

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
class FindlawSearchRequest:
    search_query: str = "${cfg.searchQuery}"
    max_results: int = ${cfg.maxResults}


@dataclass
class FindlawArticleItem:
    title: str = ""
    category: str = ""
    summary: str = ""
    url: str = ""


@dataclass
class FindlawSearchResult:
    items: List[FindlawArticleItem] = field(default_factory=list)


# Search for legal articles and information on FindLaw by keyword.
def findlaw_search(page: Page, request: FindlawSearchRequest) -> FindlawSearchResult:
    """Search for legal articles and information on FindLaw."""
    print(f"  Query: {request.search_query}\\n")

    query = request.search_query.replace(" ", "+")
    url = f"https://www.findlaw.com/search.html?q={query}"
    print(f"Loading {url}...")
    checkpoint("Navigate to FindLaw search results")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    result = FindlawSearchResult()

    checkpoint("Extract legal article listings")
    js_code = """(max) => {
        const cards = document.querySelectorAll('[class*="search-result"], [class*="result"], article, .searchResultItem, li[class*="result"]');
        const items = [];
        for (const card of cards) {
            if (items.length >= max) break;
            const titleEl = card.querySelector('h2 a, h3 a, [class*="title"] a, a[class*="title"]');
            const categoryEl = card.querySelector('[class*="category"], [class*="breadcrumb"], [class*="type"], span[class*="label"]');
            const summaryEl = card.querySelector('p, [class*="snippet"], [class*="description"], [class*="summary"]');
            const linkEl = card.querySelector('a[href]');

            const title = titleEl ? titleEl.textContent.trim() : '';
            const category = categoryEl ? categoryEl.textContent.trim() : '';
            const summary = summaryEl ? summaryEl.textContent.trim() : '';
            const url = linkEl ? linkEl.href : '';

            if (title) {
                items.push({title, category, summary, url});
            }
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = FindlawArticleItem()
        item.title = d.get("title", "")
        item.category = d.get("category", "")
        item.summary = d.get("summary", "")
        item.url = d.get("url", "")
        result.items.append(item)

    for i, item in enumerate(result.items, 1):
        print(f"\\n  Article {i}:")
        print(f"    Title:    {item.title}")
        print(f"    Category: {item.category}")
        print(f"    Summary:  {item.summary[:100]}...")
        print(f"    URL:      {item.url}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("findlaw")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            request = FindlawSearchRequest()
            result = findlaw_search(page, request)
            print("\\n=== DONE ===")
            print(f"Found {len(result.items)} legal articles")
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
    const url = `https://www.findlaw.com/search.html?q=${query}`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    recorder.record("navigate", url, `Navigate to ${url}`);
    await page.waitForTimeout(CFG.waits.page);

    const data = await stagehand.extract(
      `Extract the first ${CFG.maxResults} search results. For each get the title, category, summary, and URL.`
    );
    recorder.record("extract", "legal articles", JSON.stringify(data));
    console.log("Extracted:", JSON.stringify(data, null, 2));

    const outDir = __dirname;
    fs.writeFileSync(path.join(outDir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    fs.writeFileSync(path.join(outDir, "findlaw_search.py"), genPython(CFG, recorder));
    console.log("Saved findlaw_search.py");
  } finally {
    await stagehand.close();
  }
})();
