const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Seeking Alpha – Search for stock analysis articles
 */

const CFG = {
  searchQuery: "AAPL",
  maxResults: 5,
  waits: { page: 5000, action: 2000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Seeking Alpha – Search for stock analysis articles

Generated on: ${ts}
Recorded ${n} browser interactions
"""

import os, sys, shutil
import urllib.parse
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class SeekingalphaSearchRequest:
    search_query: str = "${cfg.searchQuery}"
    max_results: int = ${cfg.maxResults}


@dataclass
class SeekingalphaArticleItem:
    title: str = ""
    author: str = ""
    publish_date: str = ""
    ticker: str = ""
    summary: str = ""
    sentiment: str = ""


@dataclass
class SeekingalphaSearchResult:
    items: List[SeekingalphaArticleItem] = field(default_factory=list)


# Search for stock analysis articles on Seeking Alpha.
def seekingalpha_search(page: Page, request: SeekingalphaSearchRequest) -> SeekingalphaSearchResult:
    """Search for stock analysis articles on Seeking Alpha."""
    print(f"  Query: {request.search_query}")
    print(f"  Max results: {request.max_results}\\n")

    encoded = urllib.parse.quote_plus(request.search_query)
    url = f"https://seekingalpha.com/search?q={encoded}"
    print(f"Loading {url}...")
    checkpoint("Navigate to Seeking Alpha search results")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    result = SeekingalphaSearchResult()

    checkpoint("Extract article listings")
    js_code = """(max) => {
        const cards = document.querySelectorAll('[data-test-id*="article"], [class*="article"], [class*="result"], [class*="card"], article, [class*="post"]');
        const items = [];
        for (const card of cards) {
            if (items.length >= max) break;

            const titleEl = card.querySelector('h2, h3, h4, [class*="title"], [data-test-id*="title"], a[class*="title"]');
            const title = titleEl ? titleEl.textContent.trim() : '';
            if (!title) continue;

            const authorEl = card.querySelector('[class*="author"], [data-test-id*="author"], [class*="byline"], a[class*="author"]');
            const author = authorEl ? authorEl.textContent.trim() : '';

            const dateEl = card.querySelector('[class*="date"], time, [data-test-id*="date"], span[class*="time"]');
            const publish_date = dateEl ? (dateEl.getAttribute('datetime') || dateEl.textContent.trim()) : '';

            const tickerEl = card.querySelector('[class*="ticker"], [class*="symbol"], a[href*="/symbol/"]');
            const ticker = tickerEl ? tickerEl.textContent.trim() : '';

            const summaryEl = card.querySelector('[class*="summary"], [class*="desc"], [class*="snippet"], p');
            const summary = summaryEl ? summaryEl.textContent.trim() : '';

            const sentimentEl = card.querySelector('[class*="sentiment"], [class*="rating"], [class*="bull"], [class*="bear"]');
            const sentiment = sentimentEl ? sentimentEl.textContent.trim() : '';

            items.push({ title, author, publish_date, ticker, summary, sentiment });
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = SeekingalphaArticleItem()
        item.title = d.get("title", "")
        item.author = d.get("author", "")
        item.publish_date = d.get("publish_date", "")
        item.ticker = d.get("ticker", "")
        item.summary = d.get("summary", "")
        item.sentiment = d.get("sentiment", "")
        result.items.append(item)

    for i, item in enumerate(result.items, 1):
        print(f"\\n  Article {i}:")
        print(f"    Title:    {item.title}")
        print(f"    Author:   {item.author}")
        print(f"    Date:     {item.publish_date}")
        print(f"    Ticker:   {item.ticker}")
        print(f"    Summary:  {item.summary[:80]}")
        print(f"    Sentiment:{item.sentiment}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("seekingalpha")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            request = SeekingalphaSearchRequest()
            result = seekingalpha_search(page, request)
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
    const encoded = encodeURIComponent(CFG.searchQuery);
    const url = `https://seekingalpha.com/search?q=${encoded}`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    recorder.record("navigate", url, `Navigate to ${url}`);
    await page.waitForTimeout(CFG.waits.page);

    const data = await stagehand.extract(
      `Extract the first ${CFG.maxResults} stock analysis article results. For each get the title, author, publish date, ticker symbol, summary, and sentiment.`
    );
    recorder.record("extract", "article listings", JSON.stringify(data));
    console.log("Extracted:", JSON.stringify(data, null, 2));

    const outDir = __dirname;
    fs.writeFileSync(path.join(outDir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    fs.writeFileSync(path.join(outDir, "seekingalpha_search.py"), genPython(CFG, recorder));
    console.log("Saved seekingalpha_search.py");
  } finally {
    await stagehand.close();
  }
})();
