const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Ballotpedia – Search for election information
 */

const CFG = {
  searchQuery: "2024 Senate election",
  maxResults: 5,
  waits: { page: 5000, action: 2000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Ballotpedia – Search for election information

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
class BallotpediaSearchRequest:
    search_query: str = "${cfg.searchQuery}"
    max_results: int = ${cfg.maxResults}


@dataclass
class BallotpediaResultItem:
    title: str = ""
    snippet: str = ""
    url: str = ""
    category: str = ""


@dataclass
class BallotpediaSearchResult:
    items: List[BallotpediaResultItem] = field(default_factory=list)


# Search for election information on Ballotpedia.
def ballotpedia_search(page: Page, request: BallotpediaSearchRequest) -> BallotpediaSearchResult:
    """Search for election information on Ballotpedia."""
    print(f"  Query: {request.search_query}\\n")

    query = request.search_query.replace(" ", "+")
    url = f"https://ballotpedia.org/wiki/index.php?search={query}"
    print(f"Loading {url}...")
    checkpoint("Navigate to Ballotpedia search results")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    result = BallotpediaSearchResult()

    checkpoint("Extract search results")
    js_code = """(max) => {
        const rows = document.querySelectorAll('.mw-search-result, .searchresult, .mw-search-results li');
        const items = [];
        for (const row of rows) {
            if (items.length >= max) break;
            const titleEl = row.querySelector('.mw-search-result-heading a, a');
            const snippetEl = row.querySelector('.searchresult, .mw-search-result-data, p');
            const categoryEl = row.querySelector('[class*="category"], .mw-search-result-data');

            const title = titleEl ? titleEl.textContent.trim() : '';
            const url = titleEl ? titleEl.href : '';
            const snippet = snippetEl ? snippetEl.textContent.trim() : '';
            const category = categoryEl ? categoryEl.textContent.trim() : '';

            if (title) {
                items.push({title, snippet, url, category});
            }
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = BallotpediaResultItem()
        item.title = d.get("title", "")
        item.snippet = d.get("snippet", "")
        item.url = d.get("url", "")
        item.category = d.get("category", "")
        result.items.append(item)

    for i, item in enumerate(result.items, 1):
        print(f"\\n  Result {i}:")
        print(f"    Title:    {item.title}")
        print(f"    Snippet:  {item.snippet[:100]}...")
        print(f"    URL:      {item.url}")
        print(f"    Category: {item.category}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("ballotpedia")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            request = BallotpediaSearchRequest()
            result = ballotpedia_search(page, request)
            print("\\n=== DONE ===")
            print(f"Found {len(result.items)} results")
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
    const url = `https://ballotpedia.org/wiki/index.php?search=${query}`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    recorder.record("navigate", url, `Navigate to ${url}`);
    await page.waitForTimeout(CFG.waits.page);

    const data = await stagehand.extract(
      `Extract the first ${CFG.maxResults} search results. For each get the title, snippet text, URL, and category.`
    );
    recorder.record("extract", "search results", JSON.stringify(data));
    console.log("Extracted:", JSON.stringify(data, null, 2));

    const outDir = __dirname;
    fs.writeFileSync(path.join(outDir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    fs.writeFileSync(path.join(outDir, "ballotpedia_search.py"), genPython(CFG, recorder));
    console.log("Saved ballotpedia_search.py");
  } finally {
    await stagehand.close();
  }
})();
