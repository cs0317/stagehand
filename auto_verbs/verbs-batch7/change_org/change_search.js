const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Change.org – Petition Search
 *
 * Searches change.org for petitions and extracts:
 * title, url, signatures, location, start date.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  searchQuery: "environmental protection",
  maxResults: 5,
  waits: { page: 6000, action: 2000 },
};

// ── Python Script Generator ──────────────────────────────────────────────────
function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Change.org – Petition Search
Query: "${cfg.searchQuery}"

Generated on: ${ts}
Recorded ${n} browser interactions

Uses CDP-launched Chrome to avoid bot detection.
"""

import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from urllib.parse import quote_plus
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class PetitionSearchRequest:
    search_query: str = "${cfg.searchQuery}"
    max_results: int = ${cfg.maxResults}


@dataclass
class Petition:
    title: str = ""
    url: str = ""
    num_signatures: str = ""
    location: str = ""
    start_date: str = ""


@dataclass
class PetitionSearchResult:
    petitions: List[Petition] = field(default_factory=list)


def change_search(page: Page, request: PetitionSearchRequest) -> PetitionSearchResult:
    """Search Change.org for petitions."""
    print(f"  Query: {request.search_query}\\n")

    # ── Navigate to search results ────────────────────────────────────
    query = quote_plus(request.search_query)
    url = f"https://www.change.org/search?q={query}"
    print(f"Loading {url}...")
    checkpoint("Navigate to Change.org search")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(${cfg.waits.page})

    result = PetitionSearchResult()

    # ── Extract petitions from search results ─────────────────────────
    checkpoint("Extract petition list")
    js_code = r${"`"}""(maxResults) => {
        const articles = document.querySelectorAll('article');
        const items = [];
        for (const art of articles) {
            const a = art.querySelector('a[href*="/p/"]');
            if (!a) continue;
            const title = a.textContent.trim();
            const href = a.getAttribute('href') || '';
            const allText = art.innerText;
            // Signatures
            const sigMatch = allText.match(/([\d,]+)\\s*sig/i);
            const sigs = sigMatch ? sigMatch[1] : '';
            // Parse lines for location and date
            const lines = allText.split('\\n').map(l => l.trim()).filter(l => l.length > 0);
            let location = '';
            let startDate = '';
            for (const line of lines) {
                if (line.match(/^Started\\s/)) startDate = line.replace('Started ', '');
                if (line.match(/^[A-Z][a-z]/) && !line.match(/^Started/) && !line.includes('sig')
                    && line.length < 60 && line !== title.slice(0, line.length)) {
                    location = line;
                }
            }
            if (title && title.length > 5) {
                items.push({
                    title: title.slice(0, 200),
                    url: href.startsWith('http') ? href : 'https://www.change.org' + href,
                    sigs: sigs + ' signatures',
                    location,
                    startDate
                });
            }
            if (items.length >= maxResults) break;
        }
        return items;
    }${"`"}""
    petitions_data = page.evaluate(js_code, request.max_results)

    for pd in petitions_data:
        petition = Petition()
        petition.title = pd.get("title", "")
        petition.url = pd.get("url", "")
        petition.num_signatures = pd.get("sigs", "")
        petition.location = pd.get("location", "")
        petition.start_date = pd.get("startDate", "")
        result.petitions.append(petition)

    # ── Print results ─────────────────────────────────────────────────
    for i, p in enumerate(result.petitions, 1):
        print(f"\\n  Petition {i}:")
        print(f"    Title:      {p.title[:80]}")
        print(f"    URL:        {p.url}")
        print(f"    Signatures: {p.num_signatures}")
        print(f"    Location:   {p.location}")
        print(f"    Started:    {p.start_date}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("change")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            request = PetitionSearchRequest()
            result = change_search(page, request)
            print("\\n=== DONE ===")
            print(f"Found {len(result.petitions)} petitions")
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
    const url = `https://www.change.org/search?q=${query}`;
    console.log(`Navigating to ${url}`);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(CFG.waits.page);

    const result = await stagehand.extract({
      instruction: `Extract the first ${CFG.maxResults} petition search results. For each get: title, URL, number of signatures, location, and start date.`,
      schema: {
        type: "object",
        properties: {
          petitions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                url: { type: "string" },
                signatures: { type: "string" },
                location: { type: "string" },
                start_date: { type: "string" },
              },
            },
          },
        },
      },
    });

    console.log(`\nExtracted ${result.petitions?.length || 0} petitions`);
    for (const p of result.petitions || []) {
      console.log(`\n  Title:      ${(p.title || "").slice(0, 80)}`);
      console.log(`  URL:        ${p.url}`);
      console.log(`  Signatures: ${p.signatures}`);
      console.log(`  Location:   ${p.location}`);
      console.log(`  Started:    ${p.start_date}`);
    }

    recorder.actions.push({ type: "extract", data: result });
    fs.writeFileSync(
      path.join(__dirname, "recorded_actions.json"),
      JSON.stringify(recorder.actions, null, 2)
    );

    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(__dirname, "change_search.py"), pyCode);
    console.log("\nSaved change_search.py");
  } finally {
    await stagehand.close();
  }
})();
