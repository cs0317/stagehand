const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  query: "CRISPR gene editing",
  maxResults: 5,
  waits: { page: 5000, action: 2000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Nature.com – Scientific Article Search
Query: "${cfg.query}"

Generated on: ${ts}
Recorded ${n} browser interactions
"""

import re
import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
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
    title: str = ""
    authors: str = ""
    journal: str = ""
    date: str = ""
    url: str = ""


@dataclass
class ArticleResult:
    articles: List[Article] = field(default_factory=list)


def nature_search(page: Page, request: ArticleRequest) -> ArticleResult:
    """Search Nature.com for scientific articles."""
    print(f"  Query: {request.query}\\n")

    from urllib.parse import quote_plus
    url = f"https://www.nature.com/search?q={quote_plus(request.query)}&order=relevance"
    print(f"Loading {url}...")
    checkpoint("Navigate to Nature.com search")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    checkpoint("Extract article listings")
    articles_data = page.evaluate(r\\"\\"\\"(maxResults) => {
        const results = [];
        const seen = new Set();

        // Nature uses article elements or li with data-track-action
        const items = document.querySelectorAll('article, li[data-track-action]');
        for (const item of items) {
            if (results.length >= maxResults) break;
            const titleEl = item.querySelector('h2 a, h3 a, a[data-track-action="view article"]');
            if (!titleEl) continue;

            const title = titleEl.innerText.trim();
            if (!title || title.length < 5 || seen.has(title)) continue;
            seen.add(title);

            const href = titleEl.getAttribute('href') || '';
            const fullUrl = href.startsWith('/') ? 'https://www.nature.com' + href : href;

            // Authors
            const authorsEl = item.querySelector('[data-test="author-list"], .c-author-list, [itemprop="author"]');
            const authors = authorsEl ? authorsEl.innerText.trim().slice(0, 80) : '';

            // Journal
            const journalEl = item.querySelector('[data-test="journal-title"], .c-meta__item--journal, [itemprop="name"]');
            const journal = journalEl ? journalEl.innerText.trim() : '';

            // Date
            const dateEl = item.querySelector('time, [datetime], .c-meta__item--date');
            const date = dateEl ? (dateEl.getAttribute('datetime') || dateEl.innerText.trim()) : '';

            results.push({ title: title.slice(0, 120), authors, journal, date, url: fullUrl });
        }

        // Fallback: scan for any article-like links
        if (results.length === 0) {
            const links = document.querySelectorAll('a[href*="/articles/"]');
            for (const a of links) {
                if (results.length >= maxResults) break;
                const t = a.innerText.trim();
                if (t.length > 10 && !seen.has(t)) {
                    seen.add(t);
                    const href = a.getAttribute('href') || '';
                    const fullUrl = href.startsWith('/') ? 'https://www.nature.com' + href : href;
                    results.push({ title: t.slice(0, 120), authors: '', journal: '', date: '', url: fullUrl });
                }
            }
        }
        return results;
    }\\"\\"\\"", request.max_results)

    articles = [Article(**d) for d in articles_data]
    result = ArticleResult(articles=articles[:request.max_results])

    print("\\n" + "=" * 60)
    print(f"Nature.com: {request.query}")
    print("=" * 60)
    for i, a in enumerate(result.articles, 1):
        print(f"  {i}. {a.title}")
        if a.authors:
            print(f"     Authors: {a.authors}")
        if a.journal:
            print(f"     Journal: {a.journal}")
        if a.date:
            print(f"     Date:    {a.date}")
        if a.url:
            print(f"     URL:     {a.url}")
    print(f"\\nTotal: {len(result.articles)} articles")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("nature_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = nature_search(page, ArticleRequest())
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
    const searchUrl = `https://www.nature.com/search?q=${encodeURIComponent(CFG.query)}&order=relevance`;
    console.log(`\n🌐 Loading: ${searchUrl}...`);
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url: searchUrl, description: "Navigate to Nature.com search" });

    const articles = await stagehand.extract(
      `extract up to ${CFG.maxResults} articles with title, authors, journal, date, and URL`
    );
    console.log("\n📊 Articles:", JSON.stringify(articles, null, 2));
    recorder.record("extract", { instruction: "Extract articles", results: articles });

    const dir = path.join(__dirname);
    fs.writeFileSync(path.join(dir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    console.log(`\n💾 Saved ${recorder.actions.length} actions`);

    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(dir, "nature_search.py"), pyCode);
    console.log("🐍 Saved Python script");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
