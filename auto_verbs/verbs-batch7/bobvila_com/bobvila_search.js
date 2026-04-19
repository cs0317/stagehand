const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Bob Vila – Article Search
 *
 * Searches bobvila.com for articles and extracts:
 * title, author, summary, and URL.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  searchQuery: "bathroom renovation ideas",
  maxArticles: 5,
  waits: { page: 5000, action: 2000 },
};

// ── Python Script Generator ──────────────────────────────────────────────────
function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Bob Vila – Article Search
Query: "${cfg.searchQuery}"

Generated on: ${ts}
Recorded ${n} browser interactions

Uses CDP-launched Chrome to avoid bot detection.
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
class ArticleSearchRequest:
    search_query: str = "${cfg.searchQuery}"
    max_articles: int = ${cfg.maxArticles}


@dataclass
class Article:
    title: str = ""
    author: str = ""
    summary: str = ""
    url: str = ""


@dataclass
class ArticleSearchResult:
    articles: List[Article] = field(default_factory=list)


def bobvila_search(page: Page, request: ArticleSearchRequest) -> ArticleSearchResult:
    """Search Bob Vila for articles."""
    print(f"  Query: {request.search_query}\\n")

    # ── Navigate to search results ────────────────────────────────────
    query = quote_plus(request.search_query)
    url = f"https://www.bobvila.com/?s={query}"
    print(f"Loading {url}...")
    checkpoint("Navigate to Bob Vila search")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(${cfg.waits.page})

    result = ArticleSearchResult()

    # ── Extract articles from search results ──────────────────────────
    checkpoint("Extract article list")
    articles_data = page.evaluate("""(maxArticles) => {
        const results = [];
        const cards = document.querySelectorAll('.card-post.search-grid-post');
        for (let i = 0; i < Math.min(cards.length, maxArticles); i++) {
            const card = cards[i];
            const links = card.querySelectorAll('a');
            let title = '', url = '', author = '';
            for (const a of links) {
                const t = a.innerText.trim();
                const h = a.getAttribute('href') || '';
                if (a.getAttribute('aria-hidden') !== null) continue;
                if (h.includes('/category/')) continue;
                if (t.length > 15 && h.startsWith('http') && !title) {
                    title = t;
                    url = h;
                }
            }
            const m = card.innerText.match(/By\\\\s+([A-Z][a-zA-Z]+ [A-Z][a-zA-Z]+(?:,\\\\s*[A-Z][a-zA-Z]+ [A-Z][a-zA-Z]+)*)/);
            if (m) author = m[0];
            if (title) results.push({title, author, summary: '', url});
        }
        return results;
    }""", request.max_articles)

    for ad in articles_data:
        article = Article()
        article.title = ad.get("title", "")
        article.author = ad.get("author", "")
        article.summary = ad.get("summary", "")
        article.url = ad.get("url", "")
        result.articles.append(article)

    # ── Print results ─────────────────────────────────────────────────
    for i, a in enumerate(result.articles, 1):
        print(f"\\n  Article {i}:")
        print(f"    Title:   {a.title}")
        print(f"    Author:  {a.author}")
        print(f"    URL:     {a.url}")
        print(f"    Summary: {a.summary[:100]}...")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("bobvila")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            request = ArticleSearchRequest()
            result = bobvila_search(page, request)
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
    const query = encodeURIComponent(CFG.searchQuery);
    const url = `https://www.bobvila.com/?s=${query}`;
    console.log(`Navigating to ${url}`);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(CFG.waits.page);

    const result = await stagehand.extract({
      instruction: `Extract the first ${CFG.maxArticles} article search results. For each get: title, author, and URL.`,
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
                url: { type: "string" },
              },
            },
          },
        },
      },
    });
    console.log("Extracted:", JSON.stringify(result, null, 2));

    const outDir = path.dirname(__filename || __dirname);
    fs.writeFileSync(
      path.join(outDir, "recorded_actions.json"),
      JSON.stringify(recorder.actions, null, 2)
    );
    fs.writeFileSync(path.join(outDir, "bobvila_search.py"), genPython(CFG, recorder));
    console.log("Saved recorded_actions.json and bobvila_search.py");
  } finally {
    await stagehand.close();
  }
})();
