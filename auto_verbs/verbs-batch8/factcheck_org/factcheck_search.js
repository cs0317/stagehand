const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * FactCheck.org – Search for fact-check articles by keyword
 */

const CFG = {
  searchQuery: "climate change",
  maxResults: 5,
  waits: { page: 5000, action: 2000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
FactCheck.org – Search for fact-check articles by keyword

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
class FactcheckSearchRequest:
    search_query: str = "${cfg.searchQuery}"
    max_results: int = ${cfg.maxResults}


@dataclass
class FactcheckArticleItem:
    title: str = ""
    author: str = ""
    publish_date: str = ""
    claim_reviewed: str = ""
    verdict: str = ""
    summary: str = ""


@dataclass
class FactcheckSearchResult:
    items: List[FactcheckArticleItem] = field(default_factory=list)


# Search for fact-check articles on FactCheck.org by keyword.
def factcheck_search(page: Page, request: FactcheckSearchRequest) -> FactcheckSearchResult:
    """Search for fact-check articles on FactCheck.org."""
    print(f"  Query: {request.search_query}\\n")

    query = request.search_query.replace(" ", "+")
    url = f"https://www.factcheck.org/?s={query}"
    print(f"Loading {url}...")
    checkpoint("Navigate to FactCheck.org search results")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    result = FactcheckSearchResult()

    checkpoint("Extract fact-check article listings")
    js_code = """(max) => {
        const cards = document.querySelectorAll('article, .entry, [class*="post"], [class*="search-result"], .type-post');
        const items = [];
        for (const card of cards) {
            if (items.length >= max) break;
            const titleEl = card.querySelector('h2 a, h3 a, .entry-title a, [class*="title"] a');
            const authorEl = card.querySelector('[class*="author"], [class*="byline"], .author, [rel="author"]');
            const dateEl = card.querySelector('time, [class*="date"], .entry-date, [class*="time"]');
            const summaryEl = card.querySelector('.entry-content p, .entry-summary p, [class*="excerpt"], p');
            const claimEl = card.querySelector('[class*="claim"], blockquote, [class*="Claim"]');
            const verdictEl = card.querySelector('[class*="verdict"], [class*="rating"], [class*="Verdict"]');

            const title = titleEl ? titleEl.textContent.trim() : '';
            const author = authorEl ? authorEl.textContent.trim().replace(/^[Bb]y\\s*/, '') : '';
            const publish_date = dateEl ? (dateEl.getAttribute('datetime') || dateEl.textContent.trim()) : '';
            const summary = summaryEl ? summaryEl.textContent.trim() : '';
            const claim_reviewed = claimEl ? claimEl.textContent.trim() : '';
            const verdict = verdictEl ? verdictEl.textContent.trim() : '';

            if (title) {
                items.push({title, author, publish_date, claim_reviewed, verdict, summary});
            }
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = FactcheckArticleItem()
        item.title = d.get("title", "")
        item.author = d.get("author", "")
        item.publish_date = d.get("publish_date", "")
        item.claim_reviewed = d.get("claim_reviewed", "")
        item.verdict = d.get("verdict", "")
        item.summary = d.get("summary", "")
        result.items.append(item)

    for i, item in enumerate(result.items, 1):
        print(f"\\n  Article {i}:")
        print(f"    Title:   {item.title}")
        print(f"    Author:  {item.author}")
        print(f"    Date:    {item.publish_date}")
        print(f"    Claim:   {item.claim_reviewed[:80]}...")
        print(f"    Verdict: {item.verdict}")
        print(f"    Summary: {item.summary[:100]}...")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("factcheck")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            request = FactcheckSearchRequest()
            result = factcheck_search(page, request)
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
    const url = `https://www.factcheck.org/?s=${query}`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    recorder.record("navigate", url, `Navigate to ${url}`);
    await page.waitForTimeout(CFG.waits.page);

    const data = await stagehand.extract(
      `Extract the first ${CFG.maxResults} fact-check article results. For each get the title, author, publish date, claim reviewed, verdict, and summary.`
    );
    recorder.record("extract", "fact-check articles", JSON.stringify(data));
    console.log("Extracted:", JSON.stringify(data, null, 2));

    const outDir = __dirname;
    fs.writeFileSync(path.join(outDir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    fs.writeFileSync(path.join(outDir, "factcheck_search.py"), genPython(CFG, recorder));
    console.log("Saved factcheck_search.py");
  } finally {
    await stagehand.close();
  }
})();
