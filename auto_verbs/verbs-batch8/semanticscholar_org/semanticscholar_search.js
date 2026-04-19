const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Semantic Scholar – Search for academic papers
 */

const CFG = {
  searchQuery: "transformer neural network",
  maxResults: 5,
  waits: { page: 5000, action: 2000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Semantic Scholar – Search for academic papers

Generated on: ${ts}
Recorded ${n} browser interactions
"""

import os, sys, shutil
import urllib.parse
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class SemanticscholarSearchRequest:
    search_query: str = "${cfg.searchQuery}"
    max_results: int = ${cfg.maxResults}


@dataclass
class SemanticscholarPaperItem:
    title: str = ""
    authors: str = ""
    year: str = ""
    venue: str = ""
    citation_count: str = ""
    abstract: str = ""
    fields_of_study: str = ""


@dataclass
class SemanticscholarSearchResult:
    items: List[SemanticscholarPaperItem] = field(default_factory=list)


# Search for academic papers on Semantic Scholar.
def semanticscholar_search(page: Page, request: SemanticscholarSearchRequest) -> SemanticscholarSearchResult:
    """Search for academic papers on Semantic Scholar."""
    print(f"  Query: {request.search_query}")
    print(f"  Max results: {request.max_results}\\n")

    encoded = urllib.parse.quote_plus(request.search_query)
    url = f"https://www.semanticscholar.org/search?q={encoded}"
    print(f"Loading {url}...")
    checkpoint("Navigate to Semantic Scholar search results")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    result = SemanticscholarSearchResult()

    checkpoint("Extract paper listings")
    js_code = """(max) => {
        const cards = document.querySelectorAll('[class*="result"], [class*="paper"], [data-test-id*="paper"], [class*="cl-paper"], article');
        const items = [];
        for (const card of cards) {
            if (items.length >= max) break;

            const titleEl = card.querySelector('h2, h3, h4, [class*="title"], [data-test-id*="title"], a[class*="title"]');
            const title = titleEl ? titleEl.textContent.trim() : '';
            if (!title) continue;

            const authorEls = card.querySelectorAll('[class*="author"], [data-test-id*="author"], a[class*="author"]');
            const authors = Array.from(authorEls).map(a => a.textContent.trim()).filter(Boolean).join(', ');

            const yearEl = card.querySelector('[class*="year"], [data-test-id*="year"], [class*="pub-date"], span[class*="year"]');
            const year = yearEl ? yearEl.textContent.trim() : '';

            const venueEl = card.querySelector('[class*="venue"], [class*="journal"], [data-test-id*="venue"]');
            const venue = venueEl ? venueEl.textContent.trim() : '';

            const citeEl = card.querySelector('[class*="cite"], [class*="citation"], [data-test-id*="cite"]');
            const citation_count = citeEl ? citeEl.textContent.trim().replace(/[^0-9,]/g, '') : '';

            const abstractEl = card.querySelector('[class*="abstract"], [class*="snippet"], [class*="tldr"], p');
            const abstract = abstractEl ? abstractEl.textContent.trim() : '';

            const fieldEl = card.querySelector('[class*="field"], [class*="topic"], [class*="tag"]');
            const fields_of_study = fieldEl ? fieldEl.textContent.trim() : '';

            items.push({ title, authors, year, venue, citation_count, abstract, fields_of_study });
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = SemanticscholarPaperItem()
        item.title = d.get("title", "")
        item.authors = d.get("authors", "")
        item.year = d.get("year", "")
        item.venue = d.get("venue", "")
        item.citation_count = d.get("citation_count", "")
        item.abstract = d.get("abstract", "")
        item.fields_of_study = d.get("fields_of_study", "")
        result.items.append(item)

    for i, item in enumerate(result.items, 1):
        print(f"\\n  Paper {i}:")
        print(f"    Title:      {item.title}")
        print(f"    Authors:    {item.authors}")
        print(f"    Year:       {item.year}")
        print(f"    Venue:      {item.venue}")
        print(f"    Citations:  {item.citation_count}")
        print(f"    Abstract:   {item.abstract[:80]}")
        print(f"    Fields:     {item.fields_of_study}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("semanticscholar")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            request = SemanticscholarSearchRequest()
            result = semanticscholar_search(page, request)
            print("\\n=== DONE ===")
            print(f"Found {len(result.items)} papers")
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
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder(stagehand.page);
  const page = stagehand.page;

  try {
    const encoded = encodeURIComponent(CFG.searchQuery);
    const url = `https://www.semanticscholar.org/search?q=${encoded}`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    recorder.record("navigate", url, `Navigate to ${url}`);
    await page.waitForTimeout(CFG.waits.page);

    const data = await stagehand.extract(
      `Extract the first ${CFG.maxResults} academic paper results. For each get the title, authors, year, venue, citation count, abstract, and fields of study.`
    );
    recorder.record("extract", "paper listings", JSON.stringify(data));
    console.log("Extracted:", JSON.stringify(data, null, 2));

    const outDir = __dirname;
    fs.writeFileSync(path.join(outDir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    fs.writeFileSync(path.join(outDir, "semanticscholar_search.py"), genPython(CFG, recorder));
    console.log("Saved semanticscholar_search.py");
  } finally {
    await stagehand.close();
  }
})();
