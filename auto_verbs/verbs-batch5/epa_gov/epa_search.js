const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * epa.gov – Environmental Information Search
 *
 * Searches EPA.gov for environmental/regulatory info and extracts
 * page title, summary/description, and URL.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  url: "https://search.epa.gov/epasearch/",
  searchQuery: "air quality standards",
  maxResults: 5,
  waits: { page: 15000 },
};

// ── Python Script Generator ──────────────────────────────────────────────────
function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
epa.gov – Environmental Information Search
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
class EPASearchRequest:
    search_query: str = "${cfg.searchQuery}"
    max_results: int = ${cfg.maxResults}


@dataclass(frozen=True)
class EPAResult:
    page_title: str = ""
    summary: str = ""
    url: str = ""


@dataclass(frozen=True)
class EPASearchResult:
    results: list = None  # list[EPAResult]


def epa_search(page: Page, request: EPASearchRequest) -> EPASearchResult:
    """Search EPA.gov for environmental information."""
    query = request.search_query
    max_results = request.max_results
    print(f"  Query: {query}")
    print(f"  Max results: {max_results}\\n")

    # ── Navigate to search ────────────────────────────────────────────
    url = f"https://search.epa.gov/epasearch/?querytext={urllib.parse.quote_plus(query)}&typeofsearch=epa&result_type="
    print(f"Loading {url}...")
    checkpoint("Navigate to EPA search")
    page.goto(url, wait_until="networkidle")
    page.wait_for_timeout(15000)
    print(f"  Loaded: {page.url}")

    # ── Extract results ───────────────────────────────────────────────
    checkpoint("Extract search results")
    results_data = page.evaluate(r"""(maxResults) => {
        const items = document.querySelectorAll('[ng-repeat="doc in data.response.docs"]');
        const results = [];
        for (const item of items) {
            if (results.length >= maxResults) break;
            const links = item.querySelectorAll('a[href]');
            let title = '';
            let url = '';
            for (const a of links) {
                const text = a.textContent.trim();
                if (text && text !== 'Show more' && !text.startsWith('http')) {
                    title = text;
                    url = a.href;
                    break;
                }
            }
            if (!title) continue;
            const lines = item.innerText.split('\\n').map(l => l.trim()).filter(l => l);
            const titleIdx = lines.findIndex(l => l === title);
            let summary = '';
            for (let i = titleIdx + 1; i < lines.length; i++) {
                if (lines[i] === 'Show more' || lines[i].startsWith('http')) break;
                summary += (summary ? ' ' : '') + lines[i];
            }
            results.push({ title, summary, url });
        }
        return results;
    }""", max_results)

    items = []
    for r in results_data:
        items.append(EPAResult(
            page_title=r.get("title", ""),
            summary=r.get("summary", ""),
            url=r.get("url", ""),
        ))

    # ── Print results ─────────────────────────────────────────────────
    print("=" * 60)
    print(f'EPA.gov - "{query}" Results')
    print("=" * 60)
    for idx, r in enumerate(items, 1):
        print(f"\\n{idx}. {r.page_title}")
        print(f"   {r.summary}")
        print(f"   URL: {r.url}")

    print(f"\\nFound {len(items)} results")
    return EPASearchResult(results=items)


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("epa_gov")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = epa_search(page, EPASearchRequest())
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
    const query = encodeURIComponent(CFG.searchQuery);
    const url = `${CFG.url}?querytext=${query}&typeofsearch=epa&result_type=`;
    console.log(`\n🌐 Navigating to ${url}...`);
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url, description: `Search EPA for "${CFG.searchQuery}"` });
    console.log(`   Loaded: ${page.url()}`);

    console.log(`\n🎯 Extracting up to ${CFG.maxResults} results...\n`);

    const results = await page.evaluate((maxResults) => {
      const items = document.querySelectorAll('[ng-repeat="doc in data.response.docs"]');
      const out = [];
      for (const item of items) {
        if (out.length >= maxResults) break;
        const links = item.querySelectorAll("a[href]");
        let title = "";
        let url = "";
        for (const a of links) {
          const text = a.textContent.trim();
          if (text && text !== "Show more" && !text.startsWith("http")) {
            title = text;
            url = a.href;
            break;
          }
        }
        if (!title) continue;
        const lines = item.innerText.split("\n").map(l => l.trim()).filter(l => l);
        const titleIdx = lines.findIndex(l => l === title);
        let summary = "";
        for (let i = titleIdx + 1; i < lines.length; i++) {
          if (lines[i] === "Show more" || lines[i].startsWith("http")) break;
          summary += (summary ? " " : "") + lines[i];
        }
        out.push({ title, summary, url });
      }
      return out;
    }, CFG.maxResults);

    recorder.record("extract", {
      instruction: "Extract EPA search results",
      description: `Extracted ${results.length} results`,
      results,
    });

    console.log(`📋 Found ${results.length} results:\n`);
    results.forEach((r, i) => {
      console.log(`   ${i + 1}. ${r.title}`);
      console.log(`      ${r.summary}`);
      console.log(`      URL: ${r.url}`);
    });

    const dir = path.join(__dirname);
    const actionsFile = path.join(dir, "recorded_actions.json");
    fs.writeFileSync(actionsFile, JSON.stringify(recorder.actions, null, 2));
    console.log(`\n💾 Saved ${recorder.actions.length} actions → ${actionsFile}`);

    const pyFile = path.join(dir, "epa_search.py");
    fs.writeFileSync(pyFile, genPython(CFG, recorder));
    console.log(`🐍 Saved Python script → ${pyFile}`);

  } catch (err) {
    console.error("❌ Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
