const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Sleep Foundation – Search for sleep health articles by keyword
 */

const CFG = {
  searchQuery: "insomnia",
  maxResults: 5,
  waits: { page: 5000, action: 2000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Sleep Foundation – Search for sleep health articles by keyword

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
class SleepfoundationSearchRequest:
    search_query: str = "${cfg.searchQuery}"
    max_results: int = ${cfg.maxResults}


@dataclass
class SleepfoundationArticleItem:
    title: str = ""
    author: str = ""
    reviewed_by: str = ""
    publish_date: str = ""
    summary: str = ""


@dataclass
class SleepfoundationSearchResult:
    items: List[SleepfoundationArticleItem] = field(default_factory=list)


# Search for sleep health articles on Sleep Foundation by keyword.
def sleepfoundation_search(page: Page, request: SleepfoundationSearchRequest) -> SleepfoundationSearchResult:
    """Search for sleep health articles on Sleep Foundation."""
    print(f"  Query: {request.search_query}\\n")

    query = request.search_query.replace(" ", "+")
    url = f"https://www.sleepfoundation.org/?s={query}"
    print(f"Loading {url}...")
    checkpoint("Navigate to Sleep Foundation search results")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    result = SleepfoundationSearchResult()

    checkpoint("Extract sleep health article listings")
    js_code = """(max) => {
        const cards = document.querySelectorAll('article, .search-result, [class*="post"], [class*="result"], [class*="card"]');
        const items = [];
        for (const card of cards) {
            if (items.length >= max) break;
            const titleEl = card.querySelector('h2 a, h3 a, .entry-title a, [class*="title"] a');
            const authorEl = card.querySelector('[class*="author"], [class*="byline"], .author, [rel="author"]');
            const reviewedEl = card.querySelector('[class*="review"], [class*="medically"], [class*="fact-check"]');
            const dateEl = card.querySelector('time, [class*="date"], .entry-date');
            const summaryEl = card.querySelector('.entry-content p, .entry-summary p, [class*="excerpt"], p');

            const title = titleEl ? titleEl.textContent.trim() : '';
            const author = authorEl ? authorEl.textContent.trim().replace(/^[Bb]y\\s*/, '') : '';
            const reviewed_by = reviewedEl ? reviewedEl.textContent.trim() : '';
            const publish_date = dateEl ? (dateEl.getAttribute('datetime') || dateEl.textContent.trim()) : '';
            const summary = summaryEl ? summaryEl.textContent.trim() : '';

            if (title) {
                items.push({title, author, reviewed_by, publish_date, summary});
            }
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = SleepfoundationArticleItem()
        item.title = d.get("title", "")
        item.author = d.get("author", "")
        item.reviewed_by = d.get("reviewed_by", "")
        item.publish_date = d.get("publish_date", "")
        item.summary = d.get("summary", "")
        result.items.append(item)

    for i, item in enumerate(result.items, 1):
        print(f"\\n  Article {i}:")
        print(f"    Title:       {item.title}")
        print(f"    Author:      {item.author}")
        print(f"    Reviewed by: {item.reviewed_by}")
        print(f"    Date:        {item.publish_date}")
        print(f"    Summary:     {item.summary[:100]}...")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("sleepfoundation")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            request = SleepfoundationSearchRequest()
            result = sleepfoundation_search(page, request)
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
    const url = `https://www.sleepfoundation.org/?s=${query}`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    recorder.record("navigate", url, `Navigate to ${url}`);
    await page.waitForTimeout(CFG.waits.page);

    const data = await stagehand.extract(
      `Extract the first ${CFG.maxResults} sleep health article results. For each get the title, author, reviewed by, publish date, and summary.`
    );
    recorder.record("extract", "sleep articles", JSON.stringify(data));
    console.log("Extracted:", JSON.stringify(data, null, 2));

    const outDir = __dirname;
    fs.writeFileSync(path.join(outDir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    fs.writeFileSync(path.join(outDir, "sleepfoundation_search.py"), genPython(CFG, recorder));
    console.log("Saved sleepfoundation_search.py");
  } finally {
    await stagehand.close();
  }
})();
