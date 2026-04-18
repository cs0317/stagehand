const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient, observeAndAct } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * cdc.gov – Health Information Search
 *
 * Searches CDC.gov for health information and extracts results
 * with page title, summary, and URL.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  url: "https://search.cdc.gov/search/index.html",
  searchQuery: "flu vaccination",
  maxResults: 5,
  waits: { page: 8000 },
};

// ── Python Script Generator ──────────────────────────────────────────────────
function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
cdc.gov – Health Information Search
Query: ${cfg.searchQuery}

Generated on: ${ts}
Recorded ${n} browser interactions

Uses Playwright's native locator API with the user's Chrome profile.
"""

import re
import os, sys, shutil
from dataclasses import dataclass
from playwright.sync_api import Playwright, sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class CDCSearchRequest:
    search_query: str = "${cfg.searchQuery}"
    max_results: int = ${cfg.maxResults}


@dataclass(frozen=True)
class CDCResult:
    page_title: str = ""
    summary: str = ""
    url: str = ""


@dataclass(frozen=True)
class CDCSearchResult:
    results: list = None  # list[CDCResult]


def cdc_search(page: Page, request: CDCSearchRequest) -> CDCSearchResult:
    """Search CDC.gov for health information."""
    query = request.search_query
    max_results = request.max_results
    print(f"  Query: {query}")
    print(f"  Max results: {max_results}\\n")

    # ── Navigate to search results page ───────────────────────────────
    import urllib.parse
    url = f"https://search.cdc.gov/search/index.html?query={urllib.parse.quote_plus(query)}"
    print(f"Loading {url}...")
    checkpoint("Navigate to CDC search")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(8000)
    print(f"  Loaded: {page.url}")

    # ── Extract results ───────────────────────────────────────────────
    checkpoint("Extract search results")
    results_data = page.evaluate(r"""(maxResults) => {
        const items = document.querySelectorAll('div.result');
        const results = [];
        for (const item of items) {
            if (results.length >= maxResults) break;
            const titleEl = item.querySelector('.result-title a');
            const descEl = item.querySelector('.result-description');
            if (!titleEl) continue;

            const pageTitle = (titleEl.textContent || '').trim();
            const url = titleEl.href || '';
            let summary = (descEl ? descEl.textContent : '').trim();
            // Remove "View in Page" suffix
            summary = summary.replace(/\\s*View in Page\\s*$/, '').trim();

            if (pageTitle) {
                results.push({ pageTitle, summary, url });
            }
        }
        return results;
    }""", max_results)

    results = []
    for r in results_data:
        results.append(CDCResult(
            page_title=r.get("pageTitle", ""),
            summary=r.get("summary", ""),
            url=r.get("url", ""),
        ))

    # ── Print results ─────────────────────────────────────────────────
    print("=" * 60)
    print(f'CDC.gov - "{query}" Search Results')
    print("=" * 60)
    for idx, r in enumerate(results, 1):
        print(f"\\n{idx}. {r.page_title}")
        print(f"   URL: {r.url}")
        print(f"   Summary: {r.summary[:150]}")

    print(f"\\nFound {len(results)} results")
    return CDCSearchResult(results=results)


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("cdc_gov")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = cdc_search(page, CDCSearchRequest())
            print(f"\\nReturned {len(result.results or [])} results")
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
    // ── Navigate to CDC search ─────────────────────────────────────
    const query = encodeURIComponent(CFG.searchQuery);
    const url = `${CFG.url}?query=${query}`;
    console.log(`\n🌐 Navigating to ${url}...`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url, description: `Search CDC for "${CFG.searchQuery}"` });
    console.log(`   Loaded: ${page.url()}`);

    // ── Extract results ────────────────────────────────────────────
    console.log(`\n🎯 Extracting up to ${CFG.maxResults} results...\n`);

    const results = await page.evaluate((maxResults) => {
      const items = document.querySelectorAll("div.result");
      const out = [];
      for (const item of items) {
        if (out.length >= maxResults) break;
        const titleEl = item.querySelector(".result-title a");
        const descEl = item.querySelector(".result-description");
        if (!titleEl) continue;

        const pageTitle = (titleEl.textContent || "").trim();
        const url = titleEl.href || "";
        let summary = (descEl ? descEl.textContent : "").trim();
        summary = summary.replace(/\s*View in Page\s*$/, "").trim();

        if (pageTitle) {
          out.push({ pageTitle, summary, url });
        }
      }
      return out;
    }, CFG.maxResults);

    recorder.record("extract", {
      instruction: "Extract search results",
      description: `Extracted ${results.length} results`,
      results,
    });

    console.log(`📋 Found ${results.length} results:\n`);
    results.forEach((r, i) => {
      console.log(`   ${i + 1}. ${r.pageTitle}`);
      console.log(`      URL: ${r.url}`);
      console.log(`      ${r.summary.substring(0, 100)}...`);
    });

    // ── Save outputs ───────────────────────────────────────────────
    const dir = path.join(__dirname);

    const actionsFile = path.join(dir, "recorded_actions.json");
    fs.writeFileSync(actionsFile, JSON.stringify(recorder.actions, null, 2));
    console.log(`\n💾 Saved ${recorder.actions.length} actions → ${actionsFile}`);

    const pyFile = path.join(dir, "cdc_search.py");
    fs.writeFileSync(pyFile, genPython(CFG, recorder));
    console.log(`🐍 Saved Python script → ${pyFile}`);

  } catch (err) {
    console.error("❌ Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
