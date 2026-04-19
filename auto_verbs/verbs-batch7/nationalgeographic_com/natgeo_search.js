const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * National Geographic – Search articles
 *
 * Extracts search results: title, date, summary, url.
 */

const CFG = {
  searchQuery: "coral reef",
  maxResults: 5,
  waits: { page: 6000, action: 2000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
National Geographic – Search articles

Generated on: ${ts}
Recorded ${n} browser interactions
"""

import os, sys, re, shutil
from dataclasses import dataclass, field
from typing import List
from urllib.parse import quote
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
    date: str = ""
    summary: str = ""
    url: str = ""


@dataclass
class SearchResult:
    articles: List[Article] = field(default_factory=list)


def natgeo_search(page: Page, request: SearchRequest) -> SearchResult:
    """Search National Geographic and extract article results."""
    print(f"  Query: {request.search_query}\\n")

    search_url = f"https://www.nationalgeographic.com/search?q={quote(request.search_query)}"
    page.goto(search_url, wait_until="domcontentloaded")
    page.wait_for_timeout(${cfg.waits.page})

    raw = page.evaluate(r"""(max) => {
        // Get top-level ResultCard containers only (direct children of list)
        const cards = document.querySelectorAll('div.ResultCard');
        const results = [];
        const seen = new Set();
        for (const card of cards) {
            // Skip nested ResultCard elements (children of other ResultCards)
            if (card.parentElement && card.parentElement.closest('div.ResultCard')) continue;
            
            const titleEl = card.querySelector('.ResultCard__Title, span[class*="Title"]');
            const descEl = card.querySelector('.ResultCard__Description, span[class*="Description"]');
            const linkEl = card.querySelector('a[class*="ResultCard__Link"]');
            
            const title = titleEl ? titleEl.textContent.trim() : '';
            if (!title || seen.has(title)) continue;
            seen.add(title);
            
            const descText = descEl ? descEl.textContent.trim() : '';
            // Description format: "Month DD, YYYY – Summary text"
            const dateMatch = descText.match(/^([A-Z][a-z]+ \\d{1,2}, \\d{4})/);
            const date = dateMatch ? dateMatch[1] : '';
            const summary = descText.replace(/^[A-Z][a-z]+ \\d{1,2}, \\d{4}\\s*[–-]\\s*/, '').trim();
            
            const url = linkEl ? linkEl.href : '';
            
            results.push({ title, date, summary, url });
            if (results.length >= max) break;
        }
        return results;
    }""", request.max_results)

    result = SearchResult()
    for item in raw:
        result.articles.append(Article(
            title=item.get("title", ""),
            date=item.get("date", ""),
            summary=item.get("summary", ""),
            url=item.get("url", ""),
        ))
    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("natgeo_search")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            req = SearchRequest()
            result = natgeo_search(page, req)
            print(f"\\n=== DONE ===")
            print(f"Found {len(result.articles)} articles\\n")
            for i, a in enumerate(result.articles, 1):
                print(f"  Article {i}:")
                print(f"    Title:   {a.title}")
                print(f"    Date:    {a.date}")
                print(f"    URL:     {a.url}")
                print(f"    Summary: {a.summary[:120]}...")
                print()
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
  const stagehand = new Stagehand({
    env: "LOCAL",
    verbose: 0,
    llmClient: setupLLMClient(),
  });
  await stagehand.init();
  const recorder = new PlaywrightRecorder("natgeo_search");
  const page = stagehand.context.pages()[0];

  try {
    const searchUrl = \`https://www.nationalgeographic.com/search?q=\${encodeURIComponent(CFG.searchQuery)}\`;
    recorder.recordAction("navigate", { url: searchUrl });
    await page.goto(searchUrl, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(CFG.waits.page);

    const articles = await stagehand.extract(
      \`extract the first \${CFG.maxResults} search result articles with title, date, summary, and url\`
    );
    console.log("Extracted:", JSON.stringify(articles, null, 2));

    // Save outputs
    const outDir = path.dirname(__filename);
    fs.writeFileSync(
      path.join(outDir, "recorded_actions.json"),
      JSON.stringify(recorder.actions, null, 2)
    );
    fs.writeFileSync(
      path.join(outDir, "natgeo_search.py"),
      genPython(CFG, recorder)
    );
    console.log("Files saved.");
  } finally {
    await stagehand.close();
  }
})();
