const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * dev.to – Article Search
 *
 * Searches dev.to for articles and extracts title, author, date, reactions, comments.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  url: "https://dev.to",
  searchQuery: "React hooks",
  maxResults: 5,
  waits: { page: 8000 },
};

// ── Python Script Generator ──────────────────────────────────────────────────
function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
dev.to – Article Search
Query: ${cfg.searchQuery}

Generated on: ${ts}
Recorded ${n} browser interactions

Uses Playwright's native locator API with the user's Chrome profile.
"""

import re
import os, sys, shutil, urllib.parse
from dataclasses import dataclass
from playwright.sync_api import Playwright, sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class DevToSearchRequest:
    search_query: str = "${cfg.searchQuery}"
    max_results: int = ${cfg.maxResults}


@dataclass(frozen=True)
class DevToArticle:
    title: str = ""
    author: str = ""
    publication_date: str = ""
    reactions: str = ""
    comments: str = ""


@dataclass(frozen=True)
class DevToSearchResult:
    articles: list = None  # list[DevToArticle]


def devto_search(page: Page, request: DevToSearchRequest) -> DevToSearchResult:
    """Search dev.to for articles."""
    query = request.search_query
    max_results = request.max_results
    print(f"  Query: {query}")
    print(f"  Max results: {max_results}\\n")

    # ── Navigate to search results ────────────────────────────────────
    url = f"https://dev.to/search?q={urllib.parse.quote_plus(query)}"
    print(f"Loading {url}...")
    checkpoint("Navigate to dev.to search")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(8000)
    print(f"  Loaded: {page.url}")

    # ── Extract articles ──────────────────────────────────────────────
    checkpoint("Extract articles")
    results_data = page.evaluate(r"""(maxResults) => {
        const articles = document.querySelectorAll('.crayons-story');
        const results = [];
        for (const article of articles) {
            if (results.length >= maxResults) break;

            // Title from the hidden navigation link
            const titleEl = article.querySelector('.crayons-story__hidden-navigation-link');
            const title = titleEl ? titleEl.textContent.trim() : '';

            // Author from profile link
            const authorEl = article.querySelector('.crayons-story__meta a.crayons-avatar');
            const authorNameEl = article.querySelector('.crayons-story__secondary');
            let author = '';
            if (authorNameEl) {
                // Author name is in the button or first text
                const btn = authorNameEl.querySelector('button, a');
                author = btn ? btn.textContent.trim() : authorNameEl.textContent.trim().split('\\n')[0].trim();
            }

            // Date from time element
            const timeEl = article.querySelector('time');
            const pubDate = timeEl ? timeEl.textContent.trim() : '';

            // Reactions and comments from detail links
            const text = article.innerText;
            const reactionsMatch = text.match(/(\\d+)\\s*reaction/i);
            const reactions = reactionsMatch ? reactionsMatch[1] : '0';

            const commentsMatch = text.match(/(\\d+)\\s*comment/i);
            const addCommentMatch = text.match(/Add Comment/i);
            const comments = commentsMatch ? commentsMatch[1] : (addCommentMatch ? '0' : '0');

            if (title) {
                results.push({ title, author, pubDate, reactions, comments });
            }
        }
        return results;
    }""", max_results)

    articles = []
    for r in results_data:
        articles.append(DevToArticle(
            title=r.get("title", ""),
            author=r.get("author", ""),
            publication_date=r.get("pubDate", ""),
            reactions=r.get("reactions", "0"),
            comments=r.get("comments", "0"),
        ))

    # ── Print results ─────────────────────────────────────────────────
    print("=" * 60)
    print(f'dev.to - "{query}" Articles')
    print("=" * 60)
    for idx, a in enumerate(articles, 1):
        print(f"\\n{idx}. {a.title}")
        print(f"   Author: {a.author} | Date: {a.publication_date}")
        print(f"   Reactions: {a.reactions} | Comments: {a.comments}")

    print(f"\\nFound {len(articles)} articles")
    return DevToSearchResult(articles=articles)


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("dev_to")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = devto_search(page, DevToSearchRequest())
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
      args: [
        "--disable-blink-features=AutomationControlled",
        "--start-maximized",
      ],
    },
  });
  await stagehand.init();
  const page = stagehand.context.pages()[0];
  const recorder = new PlaywrightRecorder();

  try {
    const query = encodeURIComponent(CFG.searchQuery);
    const url = `${CFG.url}/search?q=${query}`;
    console.log(`\n🌐 Navigating to ${url}...`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url, description: `Search dev.to for "${CFG.searchQuery}"` });
    console.log(`   Loaded: ${page.url()}`);

    console.log(`\n🎯 Extracting up to ${CFG.maxResults} articles...\n`);

    const results = await page.evaluate((maxResults) => {
      const articles = document.querySelectorAll(".crayons-story");
      const out = [];
      for (const article of articles) {
        if (out.length >= maxResults) break;
        const titleEl = article.querySelector(".crayons-story__hidden-navigation-link");
        const title = titleEl ? titleEl.textContent.trim() : "";
        const authorNameEl = article.querySelector(".crayons-story__secondary");
        let author = "";
        if (authorNameEl) {
          const btn = authorNameEl.querySelector("button, a");
          author = btn ? btn.textContent.trim() : authorNameEl.textContent.trim().split("\n")[0].trim();
        }
        const timeEl = article.querySelector("time");
        const pubDate = timeEl ? timeEl.textContent.trim() : "";
        const text = article.innerText;
        const reactionsMatch = text.match(/(\d+)\s*reaction/i);
        const reactions = reactionsMatch ? reactionsMatch[1] : "0";
        const commentsMatch = text.match(/(\d+)\s*comment/i);
        const comments = commentsMatch ? commentsMatch[1] : "0";
        if (title) out.push({ title, author, pubDate, reactions, comments });
      }
      return out;
    }, CFG.maxResults);

    recorder.record("extract", {
      instruction: "Extract articles",
      description: `Extracted ${results.length} articles`,
      results,
    });

    console.log(`📋 Found ${results.length} articles:\n`);
    results.forEach((r, i) => {
      console.log(`   ${i + 1}. ${r.title}`);
      console.log(`      Author: ${r.author} | Date: ${r.pubDate} | Reactions: ${r.reactions} | Comments: ${r.comments}`);
    });

    const dir = path.join(__dirname);
    const actionsFile = path.join(dir, "recorded_actions.json");
    fs.writeFileSync(actionsFile, JSON.stringify(recorder.actions, null, 2));
    console.log(`\n💾 Saved ${recorder.actions.length} actions → ${actionsFile}`);

    const pyFile = path.join(dir, "devto_search.py");
    fs.writeFileSync(pyFile, genPython(CFG, recorder));
    console.log(`🐍 Saved Python script → ${pyFile}`);

  } catch (err) {
    console.error("❌ Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
