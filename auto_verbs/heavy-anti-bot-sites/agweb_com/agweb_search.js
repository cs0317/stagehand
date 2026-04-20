const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  searchQuery: "corn prices",
  maxResults: 5,
  waits: { page: 5000, action: 2000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  return `"""
Auto-generated Playwright script (Python)
AgWeb – News article search
Generated on: ${ts}
"""

import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from urllib.parse import quote_plus
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class AgWebSearchRequest:
    search_query: str = "${cfg.searchQuery}"
    max_results: int = ${cfg.maxResults}


@dataclass
class ArticleItem:
    headline: str = ""
    author: str = ""
    publish_date: str = ""
    summary: str = ""


@dataclass
class AgWebSearchResult:
    query: str = ""
    items: List[ArticleItem] = field(default_factory=list)


def search_agweb(page: Page, request: AgWebSearchRequest) -> AgWebSearchResult:
    encoded = quote_plus(request.search_query)
    url = f"https://www.agweb.com/search?query={encoded}"
    print(f"Loading {url}...")
    checkpoint("Navigate to AgWeb search")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    result = AgWebSearchResult(query=request.search_query)

    checkpoint("Extract articles")
    js_code = """(max) => {
        const items = [];
        const cards = document.querySelectorAll('article, .search-result, [class*="SearchResult"], .views-row, .node--type-article');
        for (const card of cards) {
            if (items.length >= max) break;
            let headline = '';
            const hEl = card.querySelector('h2 a, h3 a, h2, h3, .field--name-title a');
            if (hEl) headline = hEl.textContent.trim();

            let author = '';
            const authEl = card.querySelector('[class*="author"], .field--name-field-author, [rel="author"]');
            if (authEl) author = authEl.textContent.trim();

            let date = '';
            const dateEl = card.querySelector('time, [class*="date"], .field--name-field-date');
            if (dateEl) date = (dateEl.getAttribute('datetime') || dateEl.textContent).trim();

            let summary = '';
            const sumEl = card.querySelector('p, .field--name-body, [class*="summary"], [class*="teaser"]');
            if (sumEl) summary = sumEl.textContent.trim().substring(0, 200);

            if (headline) items.push({headline, author, publish_date: date, summary});
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = ArticleItem()
        item.headline = d.get("headline", "")
        item.author = d.get("author", "")
        item.publish_date = d.get("publish_date", "")
        item.summary = d.get("summary", "")
        result.items.append(item)

    print(f"\\nFound {len(result.items)} articles for '{request.search_query}':")
    for i, item in enumerate(result.items, 1):
        print(f"\\n  {i}. {item.headline}")
        print(f"     Author: {item.author}")
        print(f"     Date:   {item.publish_date}")
        print(f"     Summary: {item.summary[:100]}...")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("agweb")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            result = search_agweb(page, AgWebSearchRequest())
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
  const recorder = new PlaywrightRecorder();
  const page = stagehand.page;
  try {
    const encoded = encodeURIComponent(CFG.searchQuery);
    await page.goto(`https://www.agweb.com/search?query=${encoded}`, { waitUntil: "domcontentloaded" });
    recorder.goto(`https://www.agweb.com/search?query=${encoded}`);
    await page.waitForTimeout(CFG.waits.page);
    const data = await stagehand.extract(`Extract the top ${CFG.maxResults} news articles with headline, author, publish date, and summary.`);
    recorder.record("extract", { description: "news articles", results: data });
    console.log("Extracted:", JSON.stringify(data, null, 2));
    const outDir = __dirname;
    fs.writeFileSync(path.join(outDir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    fs.writeFileSync(path.join(outDir, "agweb_search.py"), genPython(CFG, recorder));
    console.log("Saved agweb_search.py");
  } finally { await stagehand.close(); }
})();
