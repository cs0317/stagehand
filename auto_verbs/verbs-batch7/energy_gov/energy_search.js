const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Energy.gov – Search articles and news
 *
 * Extracts search results:
 * title, url, date, content_type, office.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  searchQuery: "renewable energy",
  maxResults: 5,
  waits: { page: 6000, action: 2000 },
};

// ── Python Script Generator ──────────────────────────────────────────────────
function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Energy.gov – Search articles/news

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
class SearchItem:
    title: str = ""
    url: str = ""
    date: str = ""
    content_type: str = ""
    office: str = ""


@dataclass
class SearchResult:
    items: List[SearchItem] = field(default_factory=list)


def energy_search(page: Page, request: SearchRequest) -> SearchResult:
    """Search Energy.gov and extract article/news results."""
    print(f"  Query: {request.search_query}\\n")

    # ── Navigate to search ────────────────────────────────────────────
    encoded = quote_plus(request.search_query)
    url = f"https://www.energy.gov/search?keyword={encoded}&page=0"
    print(f"Loading {url}...")
    checkpoint("Navigate to Energy.gov search")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(${cfg.waits.page})

    result = SearchResult()

    # ── Extract search results ────────────────────────────────────────
    checkpoint("Extract search results")
    js_code = """(max) => {
        // Find the Search Results heading, then its parent container
        const headings = document.querySelectorAll('h3');
        let container = null;
        for (const h of headings) {
            if (h.textContent.includes('Search Results')) {
                container = h.parentElement;
                break;
            }
        }
        if (!container) return [];

        // Get all links within the results container
        const links = container.querySelectorAll('a[href]');
        const items = [];
        for (const a of links) {
            if (items.length >= max) break;
            const href = a.getAttribute('href') || '';
            if (!href.startsWith('/') || href.startsWith('/search')) continue;
            if (a.textContent.trim().length < 10) continue;

            // Each result card has: TYPE\\nTitle\\nDate\\nOFFICE
            const card = a.closest('li') || a.closest('div');
            if (!card) continue;
            const text = card.innerText.trim();
            const lines = text.split('\\n').map(l => l.trim()).filter(l => l.length > 0);

            const title = a.textContent.trim();
            const fullUrl = 'https://www.energy.gov' + href;

            // Content type is typically the first line (uppercase)
            let contentType = '';
            const firstLine = lines[0] || '';
            if (firstLine === firstLine.toUpperCase() && firstLine.length < 50) {
                contentType = firstLine;
            }

            // Date is a line matching month pattern
            let date = '';
            const dateRe = /^(January|February|March|April|May|June|July|August|September|October|November|December)\\s+\\d{1,2},\\s+\\d{4}$/;
            for (const l of lines) {
                if (dateRe.test(l)) { date = l; break; }
            }

            // Office is the last line (uppercase)
            let office = '';
            const lastLine = lines[lines.length - 1] || '';
            if (lastLine === lastLine.toUpperCase() && lastLine.length > 5 && lastLine !== contentType) {
                office = lastLine;
            }

            items.push({title, url: fullUrl, date, content_type: contentType, office});
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = SearchItem()
        item.title = d.get("title", "")
        item.url = d.get("url", "")
        item.date = d.get("date", "")
        item.content_type = d.get("content_type", "")
        item.office = d.get("office", "")
        result.items.append(item)

    # ── Print results ─────────────────────────────────────────────────
    for i, item in enumerate(result.items, 1):
        print(f"\\n  Result {i}:")
        print(f"    Title:   {item.title}")
        print(f"    URL:     {item.url}")
        print(f"    Date:    {item.date}")
        print(f"    Type:    {item.content_type}")
        print(f"    Office:  {item.office}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("energy_gov")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            request = SearchRequest()
            result = energy_search(page, request)
            print("\\n=== DONE ===")
            print(f"Found {len(result.items)} results")
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
    // Navigate to Energy.gov search
    const encoded = encodeURIComponent(CFG.searchQuery);
    const searchUrl = `https://www.energy.gov/search?keyword=${encoded}&page=0`;
    await page.goto(searchUrl, { waitUntil: "domcontentloaded" });
    recorder.record("navigate", searchUrl, `Navigate to ${searchUrl}`);
    await page.waitForTimeout(CFG.waits.page);

    // Extract results
    const data = await stagehand.extract(
      `Extract the first ${CFG.maxResults} search results. For each get the title, URL, date, content type, and office.`
    );
    recorder.record("extract", "search results", JSON.stringify(data));
    console.log("Extracted:", JSON.stringify(data, null, 2));

    // Save
    const outDir = path.dirname(__filename || ".");
    fs.writeFileSync(
      path.join(outDir, "recorded_actions.json"),
      JSON.stringify(recorder.actions, null, 2)
    );
    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(outDir, "energy_search.py"), pyCode);
    console.log("Saved energy_search.py");
  } finally {
    await stagehand.close();
  }
})();
