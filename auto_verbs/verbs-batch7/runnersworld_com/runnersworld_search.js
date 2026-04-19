const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Runner's World – Article Search
 *
 * Searches runnersworld.com for articles:
 * title, author, date, summary.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  searchQuery: "marathon training plan",
  maxArticles: 5,
  waits: { page: 5000, action: 2000 },
};

// ── Python Script Generator ──────────────────────────────────────────────────
function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Runner's World – Article Search

Generated on: ${ts}
Recorded ${n} browser interactions

Uses CDP-launched Chrome to avoid bot detection.
"""

import os, sys, shutil, re
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class SearchRequest:
    search_query: str = "${cfg.searchQuery}"
    max_articles: int = ${cfg.maxArticles}


@dataclass
class Article:
    title: str = ""
    author: str = ""
    date: str = ""
    summary: str = ""


@dataclass
class SearchResult:
    articles: List[Article] = field(default_factory=list)


def runnersworld_search(page: Page, request: SearchRequest) -> SearchResult:
    """Search Runner's World for articles."""
    print(f"  Query: {request.search_query}\\n")

    # ── Navigate to search page ───────────────────────────────────────
    query_encoded = request.search_query.replace(" ", "+")
    url = f"https://www.runnersworld.com/search/?q={query_encoded}"
    print(f"Loading {url}...")
    checkpoint("Navigate to search")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(${cfg.waits.page})

    result = SearchResult()

    # ── Extract articles via text parsing ─────────────────────────────
    checkpoint("Extract search results")
    js_code = """(max) => {
        const body = document.body.innerText;
        // Find the results section after "results for keyword"
        const startMatch = body.match(/\\\\d+ results for keyword .+\\\\n/);
        if (!startMatch) return [];
        const startIdx = body.indexOf(startMatch[0]) + startMatch[0].length;
        // Find end at "Advertisement" or footer
        let endIdx = body.indexOf('Advertisement', startIdx);
        if (endIdx < 0) endIdx = body.length;
        const section = body.substring(startIdx, endIdx);

        // Split by double newlines to get blocks
        const blocks = section.split(/\\\\n\\\\n+/).map(b => b.trim()).filter(b => b.length > 0);

        const articles = [];
        let i = 0;
        while (i < blocks.length && articles.length < max) {
            // Skip "Sort By:" block
            if (blocks[i].startsWith('Sort By')) { i++; continue; }

            const title = blocks[i];
            i++;
            // Next block might be summary or author line
            let summary = '', author = '', date = '';
            if (i < blocks.length && !blocks[i].match(/^[A-Z][A-Z ,.]+$/)) {
                summary = blocks[i];
                i++;
            }
            // Author line is ALL CAPS, followed by date on next line
            if (i < blocks.length) {
                const authorDateBlock = blocks[i];
                const lines = authorDateBlock.split('\\\\n').map(l => l.trim());
                if (lines.length >= 2) {
                    author = lines[0];
                    date = lines[1];
                } else {
                    author = lines[0];
                }
                i++;
            }
            if (title && !title.startsWith('Sort By')) {
                articles.push({title, author, date, summary});
            }
        }
        return articles;
    }"""
    articles_data = page.evaluate(js_code, request.max_articles)

    for ad in articles_data:
        article = Article()
        article.title = ad.get("title", "")
        article.author = ad.get("author", "")
        article.date = ad.get("date", "")
        article.summary = ad.get("summary", "")
        result.articles.append(article)

    # ── Print results ─────────────────────────────────────────────────
    for i, a in enumerate(result.articles, 1):
        print(f"\\n  Article {i}:")
        print(f"    Title:   {a.title}")
        print(f"    Author:  {a.author}")
        print(f"    Date:    {a.date}")
        print(f"    Summary: {a.summary}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("runnersworld")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            request = SearchRequest()
            result = runnersworld_search(page, request)
            print("\\n=== DONE ===")
            print(f"Found {len(result.articles)} articles")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
`;
}

// ── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({
    env: "LOCAL",
    llmClient,
    headless: false,
  });
  await stagehand.init();
  const recorder = new PlaywrightRecorder(stagehand.page);
  const page = stagehand.page;

  try {
    const query = CFG.searchQuery;
    const url = `https://www.runnersworld.com/search/?q=${query.replace(/ /g, "+")}`;
    console.log(`Navigating to ${url}`);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(CFG.waits.page);

    const result = await stagehand.extract({
      instruction: `Extract the first ${CFG.maxArticles} search result articles. For each get: title, author, publication date, and summary.`,
      schema: {
        type: "object",
        properties: {
          articles: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                author: { type: "string" },
                date: { type: "string" },
                summary: { type: "string" },
              },
            },
          },
        },
      },
    });

    console.log(`\nExtracted ${result.articles?.length || 0} articles`);
    for (const a of result.articles || []) {
      console.log(`\n  Title:   ${a.title}`);
      console.log(`  Author:  ${a.author}`);
      console.log(`  Date:    ${a.date}`);
      console.log(`  Summary: ${a.summary}`);
    }

    recorder.actions.push({ type: "extract", data: result });
    fs.writeFileSync(
      path.join(__dirname, "recorded_actions.json"),
      JSON.stringify(recorder.actions, null, 2)
    );

    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(__dirname, "runnersworld_search.py"), pyCode);
    console.log("\nSaved runnersworld_search.py");
  } finally {
    await stagehand.close();
  }
})();
