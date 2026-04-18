const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * freecodecamp.org – Tutorial Search
 *
 * Searches freeCodeCamp news for tutorials and extracts
 * title, author, publication date, and tags.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  url: "https://www.freecodecamp.org/news/search/",
  searchQuery: "Python web scraping",
  maxResults: 5,
  waits: { page: 5000 },
};

// ── Python Script Generator ──────────────────────────────────────────────────
function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
freecodecamp.org – Tutorial Search
Query: ${cfg.searchQuery}

Generated on: ${ts}
Recorded ${n} browser interactions

Uses Playwright's native locator API with the user's Chrome profile.
"""

import os, sys, shutil, urllib.parse
from dataclasses import dataclass
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class FCCSearchRequest:
    search_query: str = "${cfg.searchQuery}"
    max_results: int = ${cfg.maxResults}


@dataclass(frozen=True)
class FCCArticle:
    title: str = ""
    author: str = ""
    publication_date: str = ""
    tags: str = ""


@dataclass(frozen=True)
class FCCSearchResult:
    articles: list = None  # list[FCCArticle]


def fcc_search(page: Page, request: FCCSearchRequest) -> FCCSearchResult:
    """Search freeCodeCamp news for tutorials."""
    query = request.search_query
    max_results = request.max_results
    print(f"  Query: {query}")
    print(f"  Max results: {max_results}\\n")

    # ── Navigate to search ────────────────────────────────────────────
    url = f"https://www.freecodecamp.org/news/search/?query={urllib.parse.quote_plus(query)}"
    print(f"Loading {url}...")
    checkpoint("Navigate to freeCodeCamp search")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)
    print(f"  Loaded: {page.url}")

    # ── Extract articles ──────────────────────────────────────────────
    checkpoint("Extract article listings")
    results_data = page.evaluate(r"""(maxResults) => {
        const cards = document.querySelectorAll('article.post-card');
        const results = [];
        for (const card of cards) {
            if (results.length >= maxResults) break;
            const titleEl = card.querySelector('h2.post-card-title');
            const authorEl = card.querySelector('a.meta-item');
            const dateEl = card.querySelector('time.meta-item');
            const tagsEl = card.querySelector('span.post-card-tags');
            if (!titleEl) continue;
            results.push({
                title: titleEl.textContent.trim(),
                author: authorEl ? authorEl.textContent.trim() : '',
                date: dateEl ? dateEl.textContent.trim() : '',
                tags: tagsEl ? tagsEl.textContent.trim() : ''
            });
        }
        return results;
    }""", max_results)

    articles = []
    for r in results_data:
        articles.append(FCCArticle(
            title=r.get("title", ""),
            author=r.get("author", ""),
            publication_date=r.get("date", ""),
            tags=r.get("tags", ""),
        ))

    # ── Print results ─────────────────────────────────────────────────
    print("=" * 60)
    print(f'freeCodeCamp - "{query}" Tutorials')
    print("=" * 60)
    for idx, a in enumerate(articles, 1):
        print(f"\\n{idx}. {a.title}")
        print(f"   Author: {a.author} | Date: {a.publication_date}")
        if a.tags:
            print(f"   Tags: {a.tags}")

    print(f"\\nFound {len(articles)} articles")
    return FCCSearchResult(articles=articles)


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("freecodecamp_org")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = fcc_search(page, FCCSearchRequest())
            print(f"\\nReturned {len(result.articles or [])} articles")
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
    const query = encodeURIComponent(CFG.searchQuery);
    const url = `${CFG.url}?query=${query}`;
    console.log(`\n🌐 Navigating to ${url}...`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url, description: `Search freeCodeCamp for "${CFG.searchQuery}"` });
    console.log(`   Loaded: ${page.url()}`);

    console.log(`\n🎯 Extracting up to ${CFG.maxResults} articles...\n`);

    const results = await page.evaluate((maxResults) => {
      const cards = document.querySelectorAll("article.post-card");
      const out = [];
      for (const card of cards) {
        if (out.length >= maxResults) break;
        const titleEl = card.querySelector("h2.post-card-title");
        const authorEl = card.querySelector("a.meta-item");
        const dateEl = card.querySelector("time.meta-item");
        const tagsEl = card.querySelector("span.post-card-tags");
        if (!titleEl) continue;
        out.push({
          title: titleEl.textContent.trim(),
          author: authorEl ? authorEl.textContent.trim() : "",
          date: dateEl ? dateEl.textContent.trim() : "",
          tags: tagsEl ? tagsEl.textContent.trim() : "",
        });
      }
      return out;
    }, CFG.maxResults);

    recorder.record("extract", {
      instruction: "Extract freeCodeCamp articles",
      description: `Extracted ${results.length} articles`,
      results,
    });

    console.log(`📋 Found ${results.length} articles:\n`);
    results.forEach((r, i) => {
      console.log(`   ${i + 1}. ${r.title}`);
      console.log(`      Author: ${r.author} | Date: ${r.date} | Tags: ${r.tags}`);
    });

    const dir = path.join(__dirname);
    const actionsFile = path.join(dir, "recorded_actions.json");
    fs.writeFileSync(actionsFile, JSON.stringify(recorder.actions, null, 2));
    console.log(`\n💾 Saved ${recorder.actions.length} actions → ${actionsFile}`);

    const pyFile = path.join(dir, "fcc_search.py");
    fs.writeFileSync(pyFile, genPython(CFG, recorder));
    console.log(`🐍 Saved Python script → ${pyFile}`);

  } catch (err) {
    console.error("❌ Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
