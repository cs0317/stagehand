const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Car and Driver – Search Articles
 *
 * Searches caranddriver.com for articles/reviews and extracts:
 * title, url, description, date.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  searchQuery: "best SUV 2025",
  maxResults: 5,
  waits: { page: 6000, action: 2000 },
};

// ── Python Script Generator ──────────────────────────────────────────────────
function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Car and Driver – Search Articles
Query: "${cfg.searchQuery}"

Generated on: ${ts}
Recorded ${n} browser interactions

Uses CDP-launched Chrome to avoid bot detection.
"""

import os, sys, shutil, re
from dataclasses import dataclass, field
from typing import List
from urllib.parse import quote_plus
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class SearchRequest:
    search_query: str = "${cfg.searchQuery}"
    max_results: int = ${cfg.maxResults}


@dataclass
class Article:
    title: str = ""
    url: str = ""
    description: str = ""
    date: str = ""


@dataclass
class SearchResult:
    articles: List[Article] = field(default_factory=list)


def caranddriver_search(page: Page, request: SearchRequest) -> SearchResult:
    """Search Car and Driver for articles/reviews."""
    print(f"  Query: {request.search_query}\\n")

    # ── Navigate to search results ────────────────────────────────────
    query = quote_plus(request.search_query)
    url = f"https://www.caranddriver.com/search/?q={query}"
    print(f"Loading {url}...")
    checkpoint("Navigate to Car and Driver search")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(${cfg.waits.page})

    result = SearchResult()

    # ── Extract articles from search results ──────────────────────────
    checkpoint("Extract search results")
    articles_data = page.evaluate("""(maxResults) => {
        const results = [];
        // Each result link has data-id="search-content-preview-link"
        const links = document.querySelectorAll('a[data-id="search-content-preview-link"]');
        for (const a of links) {
            const href = a.getAttribute('href') || '';
            const img = a.querySelector('img');
            const title = img ? (img.getAttribute('alt') || '').trim() : '';
            // Description is in a <span> or text after the title
            const descEl = a.querySelector('span');
            let description = descEl ? descEl.textContent.trim() : '';
            // Date - look for a date pattern in text
            const allText = a.textContent || '';
            const dateMatch = allText.match(/([A-Z][a-z]{2,8}\\s+\\d{1,2},\\s+\\d{4})/);
            const date = dateMatch ? dateMatch[1] : '';

            if (title && title.length > 5) {
                results.push({
                    title,
                    url: href.startsWith('http') ? href : 'https://www.caranddriver.com' + href,
                    description: description || '',
                    date
                });
            }
            if (results.length >= maxResults) break;
        }
        return results;
    }""", request.max_results)

    for ad in articles_data:
        article = Article()
        article.title = ad.get("title", "")
        article.url = ad.get("url", "")
        article.description = ad.get("description", "")
        article.date = ad.get("date", "")
        result.articles.append(article)

    # ── Print results ─────────────────────────────────────────────────
    for i, a in enumerate(result.articles, 1):
        print(f"\\n  Article {i}:")
        print(f"    Title:       {a.title}")
        print(f"    URL:         {a.url}")
        print(f"    Description: {a.description[:100]}")
        print(f"    Date:        {a.date}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("caranddriver")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            request = SearchRequest()
            result = caranddriver_search(page, request)
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
    const url = `https://www.caranddriver.com/search/?q=${query}`;
    console.log(`Navigating to ${url}`);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(CFG.waits.page);

    const result = await stagehand.extract({
      instruction: `Extract the first ${CFG.maxResults} search result articles. For each get: title, URL link, description snippet, and date.`,
      schema: {
        type: "object",
        properties: {
          articles: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                url: { type: "string" },
                description: { type: "string" },
                date: { type: "string" },
              },
            },
          },
        },
      },
    });

    console.log(`\nExtracted ${result.articles?.length || 0} articles`);
    for (const a of result.articles || []) {
      console.log(`\n  Title:       ${a.title}`);
      console.log(`  URL:         ${a.url}`);
      console.log(`  Description: ${(a.description || "").slice(0, 80)}`);
      console.log(`  Date:        ${a.date}`);
    }

    // Save recorder actions
    recorder.actions.push({ type: "extract", data: result });
    fs.writeFileSync(
      path.join(__dirname, "recorded_actions.json"),
      JSON.stringify(recorder.actions, null, 2)
    );

    // Generate Python file
    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(__dirname, "caranddriver_search.py"), pyCode);
    console.log("\nSaved caranddriver_search.py");
  } finally {
    await stagehand.close();
  }
})();
