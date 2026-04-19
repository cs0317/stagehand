const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Snopes – Search for fact-check articles by keyword
 */

const CFG = {
  searchQuery: "vaccine",
  maxResults: 5,
  waits: { page: 5000, action: 2000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Snopes – Search for fact-check articles by keyword

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
class SnopesSearchRequest:
    search_query: str = "${cfg.searchQuery}"
    max_results: int = ${cfg.maxResults}


@dataclass
class SnopesArticleItem:
    title: str = ""
    rating: str = ""
    publish_date: str = ""
    claim: str = ""
    summary: str = ""


@dataclass
class SnopesSearchResult:
    items: List[SnopesArticleItem] = field(default_factory=list)


# Search for fact-check articles on Snopes by keyword.
def snopes_search(page: Page, request: SnopesSearchRequest) -> SnopesSearchResult:
    """Search for fact-check articles on Snopes."""
    print(f"  Query: {request.search_query}\\n")

    query = request.search_query.replace(" ", "+")
    url = f"https://www.snopes.com/?s={query}"
    print(f"Loading {url}...")
    checkpoint("Navigate to Snopes search results")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    result = SnopesSearchResult()

    checkpoint("Extract fact-check article listings")
    js_code = """(max) => {
        const cards = document.querySelectorAll('article, .search-result, [class*="media-body"], [class*="article"], [class*="card"]');
        const items = [];
        for (const card of cards) {
            if (items.length >= max) break;
            const titleEl = card.querySelector('h2 a, h3 a, .article-title a, [class*="title"] a, a[class*="title"]');
            const ratingEl = card.querySelector('[class*="rating"], [class*="Rating"], [class*="verdict"], [class*="label"]');
            const dateEl = card.querySelector('time, [class*="date"], .entry-date, [class*="time"]');
            const claimEl = card.querySelector('[class*="claim"], [class*="Claim"], blockquote, [class*="excerpt"]');
            const summaryEl = card.querySelector('.entry-content p, .entry-summary p, p');

            const title = titleEl ? titleEl.textContent.trim() : '';
            const rating = ratingEl ? ratingEl.textContent.trim() : '';
            const publish_date = dateEl ? (dateEl.getAttribute('datetime') || dateEl.textContent.trim()) : '';
            const claim = claimEl ? claimEl.textContent.trim() : '';
            const summary = summaryEl ? summaryEl.textContent.trim() : '';

            if (title) {
                items.push({title, rating, publish_date, claim, summary});
            }
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = SnopesArticleItem()
        item.title = d.get("title", "")
        item.rating = d.get("rating", "")
        item.publish_date = d.get("publish_date", "")
        item.claim = d.get("claim", "")
        item.summary = d.get("summary", "")
        result.items.append(item)

    for i, item in enumerate(result.items, 1):
        print(f"\\n  Article {i}:")
        print(f"    Title:   {item.title}")
        print(f"    Rating:  {item.rating}")
        print(f"    Date:    {item.publish_date}")
        print(f"    Claim:   {item.claim[:80]}...")
        print(f"    Summary: {item.summary[:100]}...")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("snopes")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            request = SnopesSearchRequest()
            result = snopes_search(page, request)
            print("\\n=== DONE ===")
            print(f"Found {len(result.items)} fact-check articles")
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
    const url = `https://www.snopes.com/?s=${query}`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    recorder.record("navigate", url, `Navigate to ${url}`);
    await page.waitForTimeout(CFG.waits.page);

    const data = await stagehand.extract(
      `Extract the first ${CFG.maxResults} fact-check article results. For each get the title, rating, publish date, claim, and summary.`
    );
    recorder.record("extract", "fact-check articles", JSON.stringify(data));
    console.log("Extracted:", JSON.stringify(data, null, 2));

    const outDir = __dirname;
    fs.writeFileSync(path.join(outDir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    fs.writeFileSync(path.join(outDir, "snopes_search.py"), genPython(CFG, recorder));
    console.log("Saved snopes_search.py");
  } finally {
    await stagehand.close();
  }
})();
