const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * nasa.gov – Article Search
 *
 * Searches NASA for articles and extracts title,
 * publication date, summary, and article URL.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  query: "Mars rover",
  maxResults: 5,
  waits: { page: 6000 },
};

// ── Python Script Generator ──────────────────────────────────────────────────
function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
nasa.gov – Article Search
Query: ${cfg.query}

Generated on: ${ts}
Recorded ${n} browser interactions

Uses Playwright's native locator API with the user's Chrome profile.
"""

import re
import os, sys, shutil
from dataclasses import dataclass
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class NasaRequest:
    query: str = "${cfg.query}"
    max_results: int = ${cfg.maxResults}


@dataclass(frozen=True)
class NasaArticle:
    title: str = ""
    publication_date: str = ""
    summary: str = ""
    article_url: str = ""


@dataclass(frozen=True)
class NasaResult:
    articles: list = None  # list[NasaArticle]


def nasa_search(page: Page, request: NasaRequest) -> NasaResult:
    """Search NASA for articles."""
    query = request.query
    print(f"  Query: {query}\\n")

    # ── Navigate to search page ───────────────────────────────────────
    url = f"https://www.nasa.gov/?search={query.replace(' ', '+')}"
    print(f"Loading {url}...")
    checkpoint("Navigate to NASA search results")
    page.goto(url, wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(6000)

    # ── Extract articles ──────────────────────────────────────────────
    articles = page.evaluate(r"""(maxResults) => {
        const links = document.querySelectorAll('a.hds-search-result');
        const results = [];
        const datePattern = /\\b(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\\s+\\d{1,2},\\s+\\d{4}$/;
        for (let i = 0; i < Math.min(links.length, maxResults); i++) {
            const a = links[i];
            const url = a.href;
            const text = a.innerText.trim();
            const lines = text.split('\\n').map(l => l.trim()).filter(l => l.length > 0);

            let title = '';
            let summary = '';
            let pubDate = '';
            let lineIdx = 0;

            // Skip "N MIN READ" line if present
            if (lines[lineIdx] && /^\\d+\\s+MIN\\s+READ$/i.test(lines[lineIdx])) {
                lineIdx++;
            }

            // Title
            title = lines[lineIdx] || '';
            lineIdx++;

            // Skip URL line
            if (lines[lineIdx] && lines[lineIdx].startsWith('http')) {
                lineIdx++;
            }

            // Remaining = summary (may end with date)
            const rest = lines.slice(lineIdx).join(' ').trim();
            const dateMatch = rest.match(datePattern);
            if (dateMatch) {
                pubDate = dateMatch[0];
                summary = rest.substring(0, rest.length - pubDate.length).trim();
                if (summary.endsWith('...')) summary = summary;
                else if (summary.endsWith('.')) summary = summary;
            } else {
                summary = rest;
            }

            results.push({ title, publication_date: pubDate, summary, article_url: url });
        }
        return results;
    }""", request.max_results)

    # ── Print results ─────────────────────────────────────────────────
    print("\\n" + "=" * 60)
    print(f'NASA - "{request.query}" Articles')
    print("=" * 60)
    for idx, a in enumerate(articles, 1):
        print(f"\\n  {idx}. {a['title']}")
        if a['publication_date']:
            print(f"     Date: {a['publication_date']}")
        snippet = a['summary'][:150]
        if len(a['summary']) > 150:
            snippet += "..."
        if snippet:
            print(f"     Summary: {snippet}")
        print(f"     URL: {a['article_url']}")

    print(f"\\nFound {len(articles)} articles")
    return NasaResult(
        articles=[NasaArticle(**a) for a in articles]
    )


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("nasa_gov")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = nasa_search(page, NasaRequest())
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
    const q = CFG.query.replace(/ /g, "+");
    const url = `https://www.nasa.gov/?search=${q}`;
    console.log(`\n🌐 Navigating to ${url}...`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url, description: `Search NASA for "${CFG.query}"` });

    const articles = await page.evaluate((maxResults) => {
      const links = document.querySelectorAll("a.hds-search-result");
      const results = [];
      const datePattern = /\b(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\s+\d{1,2},\s+\d{4}$/;
      for (let i = 0; i < Math.min(links.length, maxResults); i++) {
        const a = links[i];
        const articleUrl = a.href;
        const text = a.innerText.trim();
        const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);

        let title = "";
        let summary = "";
        let pubDate = "";
        let lineIdx = 0;

        if (lines[lineIdx] && /^\d+\s+MIN\s+READ$/i.test(lines[lineIdx])) {
          lineIdx++;
        }

        title = lines[lineIdx] || "";
        lineIdx++;

        if (lines[lineIdx] && lines[lineIdx].startsWith("http")) {
          lineIdx++;
        }

        const rest = lines.slice(lineIdx).join(" ").trim();
        const dateMatch = rest.match(datePattern);
        if (dateMatch) {
          pubDate = dateMatch[0];
          summary = rest.substring(0, rest.length - pubDate.length).trim();
        } else {
          summary = rest;
        }

        results.push({ title, publication_date: pubDate, summary, article_url: articleUrl });
      }
      return results;
    }, CFG.maxResults);

    recorder.record("extract", {
      instruction: "Extract NASA articles",
      description: `Extracted ${articles.length} articles`,
      results: articles,
    });

    console.log(`\n📋 Found ${articles.length} articles:\n`);
    articles.forEach((a, i) => {
      console.log(`   ${i + 1}. ${a.title}`);
      if (a.publication_date) console.log(`      Date: ${a.publication_date}`);
      const snippet = a.summary.length > 150 ? a.summary.substring(0, 150) + "..." : a.summary;
      if (snippet) console.log(`      Summary: ${snippet}`);
      console.log(`      URL: ${a.article_url}`);
    });

    const dir = path.join(__dirname);
    fs.writeFileSync(
      path.join(dir, "recorded_actions.json"),
      JSON.stringify(recorder.actions, null, 2)
    );
    console.log(`\n💾 Saved ${recorder.actions.length} actions`);

    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(dir, "nasa_search.py"), pyCode);
    console.log("🐍 Saved Python script");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
