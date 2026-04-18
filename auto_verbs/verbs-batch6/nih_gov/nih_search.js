const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  query: "diabetes prevention",
  maxResults: 5,
  waits: { page: 5000, action: 2000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
NIH – Health Research Search
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
    description: str = ""
    url: str = ""


@dataclass
class ArticleResult:
    articles: List[Article] = field(default_factory=list)


def nih_search(page: Page, request: ArticleRequest) -> ArticleResult:
    """Search NIH for health research articles."""
    print(f"  Query: {request.query}\\n")

    from urllib.parse import quote_plus
    url = f"https://search.nih.gov/search?query={quote_plus(request.query)}&affiliate=nih"
    print(f"Loading {url}...")
    checkpoint("Navigate to NIH search")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    checkpoint("Extract article listings")
    articles_data = page.evaluate(r\\"\\"\\"(maxResults) => {
        const results = [];
        const seen = new Set();

        // NIH search uses .content-block-item or similar result containers
        const items = document.querySelectorAll('.content-block-item, .result, article, [class*="search-result"]');
        for (const item of items) {
            if (results.length >= maxResults) break;
            const titleEl = item.querySelector('h2 a, h3 a, h4 a, a[class*="title"]');
            if (!titleEl) continue;

            const title = titleEl.innerText.trim();
            if (!title || title.length < 5 || seen.has(title)) continue;
            seen.add(title);

            const href = titleEl.getAttribute('href') || '';

            // Description
            const descEl = item.querySelector('p, .snippet, [class*="description"]');
            const description = descEl ? descEl.innerText.trim().slice(0, 200) : '';

            results.push({ title: title.slice(0, 150), description, url: href });
        }

        // Fallback: any links in main content
        if (results.length === 0) {
            const links = document.querySelectorAll('a');
            for (const a of links) {
                if (results.length >= maxResults) break;
                const t = a.innerText.trim();
                const href = a.getAttribute('href') || '';
                if (t.length > 15 && t.length < 150 && /nih\\.gov/.test(href) && !seen.has(t)) {
                    if (/^(search|home|sign|menu|skip|contact)/i.test(t)) continue;
                    seen.add(t);
                    results.push({ title: t, description: '', url: href });
                }
            }
        }
        return results;
    }\\"\\"\\"", request.max_results)

    articles = [Article(**d) for d in articles_data]
    result = ArticleResult(articles=articles[:request.max_results])

    print("\\n" + "=" * 60)
    print(f"NIH: {request.query}")
    print("=" * 60)
    for i, a in enumerate(result.articles, 1):
        print(f"  {i}. {a.title}")
        if a.description:
            print(f"     {a.description[:100]}...")
        if a.url:
            print(f"     URL: {a.url}")
    print(f"\\nTotal: {len(result.articles)} articles")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("nih_gov")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = nih_search(page, ArticleRequest())
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
    const searchUrl = `https://search.nih.gov/search?query=${encodeURIComponent(CFG.query)}&affiliate=nih`;
    console.log(`\n🌐 Loading: ${searchUrl}...`);
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url: searchUrl, description: "Navigate to NIH search" });

    const articles = await stagehand.extract(
      `extract up to ${CFG.maxResults} articles with title, description, and URL`
    );
    console.log("\n📊 Articles:", JSON.stringify(articles, null, 2));
    recorder.record("extract", { instruction: "Extract articles", results: articles });

    const dir = path.join(__dirname);
    fs.writeFileSync(path.join(dir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    console.log(`\n💾 Saved ${recorder.actions.length} actions`);

    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(dir, "nih_search.py"), pyCode);
    console.log("🐍 Saved Python script");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
