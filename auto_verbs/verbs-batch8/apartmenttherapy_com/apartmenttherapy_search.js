const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Apartment Therapy – Search Articles
 *
 * Searches apartmenttherapy.com for articles by keyword and extracts
 * title, author, publish date, category, and summary.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  searchQuery: "small kitchen ideas",
  maxResults: 5,
  waits: { page: 5000 },
};

// ── Python Script Generator ──────────────────────────────────────────────────
function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Apartment Therapy – Search Articles
Query: "${cfg.searchQuery}"

Generated on: ${ts}
Recorded ${n} browser interactions

Uses Playwright's native locator API with the user's Chrome profile.
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
class ApartmentTherapyRequest:
    search_query: str = "${cfg.searchQuery}"
    max_results: int = ${cfg.maxResults}


@dataclass
class Article:
    title: str = ""
    author: str = ""
    publish_date: str = ""
    category: str = ""
    summary: str = ""


@dataclass
class ApartmentTherapyResult:
    articles: list = field(default_factory=list)


def apartmenttherapy_search(page: Page, request: ApartmentTherapyRequest) -> ApartmentTherapyResult:
    """Search apartmenttherapy.com for articles."""
    print(f"  Query: {request.search_query}\\n")

    # ── Search ────────────────────────────────────────────────────────
    search_url = f"https://www.apartmenttherapy.com/search?q={quote_plus(request.search_query)}"
    print(f"Loading {search_url}...")
    checkpoint("Navigate to Apartment Therapy search")
    page.goto(search_url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    # ── Extract articles ──────────────────────────────────────────────
    raw_articles = page.evaluate(r"""(maxResults) => {
        const cards = document.querySelectorAll('article, [data-testid="search-result"], div[class*="PostCard"], div[class*="card"]');
        const results = [];
        for (let i = 0; i < Math.min(cards.length, maxResults); i++) {
            const card = cards[i];
            const titleEl = card.querySelector('h2, h3, a[class*="title"], [data-testid="post-title"]');
            const authorEl = card.querySelector('[class*="author"], [class*="byline"], [data-testid="author"]');
            const dateEl = card.querySelector('time, [class*="date"], [data-testid="date"]');
            const catEl = card.querySelector('[class*="category"], [class*="tag"], [data-testid="category"]');
            const summaryEl = card.querySelector('p, [class*="excerpt"], [class*="description"], [class*="summary"]');

            results.push({
                title: titleEl ? titleEl.innerText.trim() : '',
                author: authorEl ? authorEl.innerText.trim() : '',
                publish_date: dateEl ? (dateEl.getAttribute('datetime') || dateEl.innerText.trim()) : '',
                category: catEl ? catEl.innerText.trim() : '',
                summary: summaryEl ? summaryEl.innerText.trim() : '',
            });
        }
        return results;
    }""", request.max_results)

    # ── Print results ─────────────────────────────────────────────────
    print("\\n" + "=" * 60)
    print(f"Apartment Therapy: {request.search_query}")
    print("=" * 60)
    for idx, a in enumerate(raw_articles, 1):
        print(f"\\n  {idx}. {a['title']}")
        print(f"     Author: {a['author']}")
        print(f"     Date: {a['publish_date']}")
        print(f"     Category: {a['category']}")
        print(f"     Summary: {a['summary'][:100]}...")

    articles = [Article(**a) for a in raw_articles]
    return ApartmentTherapyResult(articles=articles)


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("apartmenttherapy_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = apartmenttherapy_search(page, ApartmentTherapyRequest())
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
    const searchUrl = `https://www.apartmenttherapy.com/search?q=${encodeURIComponent(CFG.searchQuery)}`;
    console.log(`\n🌐 Searching: ${searchUrl}...`);
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url: searchUrl, description: "Search Apartment Therapy" });

    const articles = await page.evaluate((maxResults) => {
      const cards = document.querySelectorAll('article, [data-testid="search-result"], div[class*="PostCard"], div[class*="card"]');
      const results = [];
      for (let i = 0; i < Math.min(cards.length, maxResults); i++) {
        const card = cards[i];
        const titleEl = card.querySelector('h2, h3, a[class*="title"], [data-testid="post-title"]');
        const authorEl = card.querySelector('[class*="author"], [class*="byline"], [data-testid="author"]');
        const dateEl = card.querySelector('time, [class*="date"], [data-testid="date"]');
        const catEl = card.querySelector('[class*="category"], [class*="tag"], [data-testid="category"]');
        const summaryEl = card.querySelector('p, [class*="excerpt"], [class*="description"], [class*="summary"]');

        results.push({
          title: titleEl ? titleEl.innerText.trim() : "",
          author: authorEl ? authorEl.innerText.trim() : "",
          publish_date: dateEl ? (dateEl.getAttribute("datetime") || dateEl.innerText.trim()) : "",
          category: catEl ? catEl.innerText.trim() : "",
          summary: summaryEl ? summaryEl.innerText.trim() : "",
        });
      }
      return results;
    }, CFG.maxResults);

    recorder.record("extract", {
      instruction: "Extract article cards",
      description: `Extracted ${articles.length} articles`,
      results: articles,
    });

    console.log("\n" + "=".repeat(60));
    console.log(`Apartment Therapy: ${CFG.searchQuery}`);
    console.log("=".repeat(60));
    articles.forEach((a, i) => {
      console.log(`\n  ${i + 1}. ${a.title}`);
      console.log(`     Author: ${a.author}`);
      console.log(`     Date: ${a.publish_date}`);
      console.log(`     Category: ${a.category}`);
      console.log(`     Summary: ${a.summary?.slice(0, 100)}...`);
    });

    // ── Save ───────────────────────────────────────────────────────────
    const outDir = path.join(__dirname);
    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(outDir, "apartmenttherapy_search.py"), pyCode);
    console.log("\n✅ Saved apartmenttherapy_search.py");

    fs.writeFileSync(
      path.join(outDir, "recorded_actions.json"),
      JSON.stringify(recorder.actions, null, 2)
    );
    console.log("✅ Saved recorded_actions.json");
  } catch (err) {
    console.error("❌ Error:", err);
  } finally {
    await stagehand.close();
  }
})();
