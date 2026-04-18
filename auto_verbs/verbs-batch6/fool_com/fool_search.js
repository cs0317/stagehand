const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  query: "dividend stocks 2025",
  maxResults: 5,
  waits: { page: 5000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Motley Fool – Article Search
Query: "${cfg.query}"

Generated on: ${ts}
Recorded ${n} browser interactions
"""

import re
import os, sys, shutil
from dataclasses import dataclass, field
from urllib.parse import quote_plus
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class ArticleRequest:
    query: str = "${cfg.query}"
    max_results: int = ${cfg.maxResults}


@dataclass
class Article:
    headline: str = ""
    author: str = ""
    date: str = ""
    summary: str = ""


@dataclass
class ArticleResult:
    articles: list = field(default_factory=list)


def fool_search(page: Page, request: ArticleRequest) -> ArticleResult:
    """Search Motley Fool for articles."""
    print(f"  Query: {request.query}\\n")

    url = f"https://www.fool.com/search/?q={quote_plus(request.query)}"
    print(f"Loading {url}...")
    checkpoint("Navigate to Motley Fool search")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    checkpoint("Extract article listings")
    items_data = page.evaluate(r"""(maxResults) => {
        const results = [];
        const items = document.querySelectorAll(
            'article, [class*="search-result"], [class*="card"], a[href*="/investing/"]'
        );
        const seen = new Set();
        for (const item of items) {
            if (results.length >= maxResults) break;
            const titleEl = item.querySelector('h2, h3, h4, [class*="title"], [class*="headline"]');
            const headline = titleEl ? titleEl.innerText.trim() : '';
            if (!headline || headline.length < 5 || seen.has(headline)) continue;
            seen.add(headline);

            const text = item.innerText || '';
            let author = '', date = '', summary = '';

            const authorEl = item.querySelector('[class*="author"], [class*="byline"]');
            if (authorEl) author = authorEl.innerText.trim().replace(/^by\\s*/i, '');

            const dateM = text.match(/(\\w+\\s+\\d{1,2},?\\s+\\d{4}|\\d{1,2}\\/\\d{1,2}\\/\\d{4})/);
            if (dateM) date = dateM[1];

            const descEl = item.querySelector('p, [class*="desc"], [class*="dek"]');
            if (descEl) summary = descEl.innerText.trim().slice(0, 200);

            results.push({ headline, author, date, summary });
        }
        return results;
    }""", request.max_results)

    result = ArticleResult(articles=[Article(**a) for a in items_data])

    print("\\n" + "=" * 60)
    print(f"Motley Fool: {request.query}")
    print("=" * 60)
    for a in result.articles:
        print(f"  {a.headline}")
        print(f"    Author: {a.author}  Date: {a.date}")
        print(f"    Summary: {a.summary[:80]}...")
    print(f"\\n  Total: {len(result.articles)} articles")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("fool_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = fool_search(page, ArticleRequest())
            print(f"\\nReturned {len(result.articles)} articles")
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
  const stagehand = new Stagehand({
    env: "LOCAL",
    verbose: 1,
    llmClient,
    localBrowserLaunchOptions: {
      headless: false,
      args: ["--disable-blink-features=AutomationControlled", "--start-maximized"],
    },
  });
  await stagehand.init();
  const page = stagehand.context.pages()[0];
  const recorder = new PlaywrightRecorder();

  try {
    const url = `https://www.fool.com/search/?q=${encodeURIComponent(CFG.query)}`;
    console.log(`\n🌐 Searching: ${url}...`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url, description: "Search Motley Fool" });

    const articles = await stagehand.extract(
      "extract up to 5 article results with headline, author, publication date, and summary"
    );
    console.log("\n📊 Articles:", JSON.stringify(articles, null, 2));
    recorder.record("extract", { instruction: "Extract articles", results: articles });

    const dir = path.join(__dirname);
    fs.writeFileSync(path.join(dir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    console.log(`\n💾 Saved ${recorder.actions.length} actions`);

    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(dir, "fool_search.py"), pyCode);
    console.log("🐍 Saved Python script");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
