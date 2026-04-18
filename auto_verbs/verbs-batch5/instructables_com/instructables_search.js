const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * instructables.com – DIY Project Search
 *
 * Searches Instructables for DIY projects and extracts
 * title, author, views, favorites, and URL.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  url: "https://www.instructables.com/search/?q=LED+lamp&projects=all",
  searchQuery: "LED lamp",
  maxResults: 5,
  waits: { page: 5000 },
};

// ── Python Script Generator ──────────────────────────────────────────────────
function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
instructables.com – DIY Project Search
Query: ${cfg.searchQuery}

Generated on: ${ts}
Recorded ${n} browser interactions

Uses Playwright's native locator API with the user's Chrome profile.
"""

import re
import os, sys, shutil, urllib.parse
from dataclasses import dataclass
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class InstructablesRequest:
    search_query: str = "${cfg.searchQuery}"
    max_results: int = ${cfg.maxResults}


@dataclass(frozen=True)
class InstructablesProject:
    project_title: str = ""
    author: str = ""
    views: str = ""
    favorites: str = ""
    project_url: str = ""


@dataclass(frozen=True)
class InstructablesResult:
    projects: list = None  # list[InstructablesProject]


def instructables_search(page: Page, request: InstructablesRequest) -> InstructablesResult:
    """Search Instructables for DIY projects."""
    query = request.search_query
    max_results = request.max_results
    print(f"  Query: {query}")
    print(f"  Max results: {max_results}\\n")

    # ── Navigate to search ────────────────────────────────────────────
    url = f"https://www.instructables.com/search/?q={urllib.parse.quote_plus(query)}&projects=all"
    print(f"Loading {url}...")
    checkpoint("Navigate to Instructables search")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    # ── Extract project cards ─────────────────────────────────────────
    projects = page.evaluate(r"""(maxResults) => {
        const cards = document.querySelectorAll('[class*="_ibleCard_"]');
        const results = [];
        for (const card of cards) {
            if (results.length >= maxResults) break;
            const titleEl = card.querySelector('strong');
            if (!titleEl) continue;
            const title = titleEl.innerText.trim();
            const authorEl = card.querySelector('a[href*="/member/"]');
            const author = authorEl ? authorEl.innerText.trim() : '';
            const titleLink = card.querySelector('a[href]');
            const projectUrl = titleLink ? titleLink.href : '';
            const text = card.innerText;
            const lines = text.split('\\n').map(l => l.trim()).filter(l => l.length > 0);
            const numLines = lines.filter(l => /^[\\d.,]+[KMB]?$/i.test(l));
            const favorites = numLines.length >= 1 ? numLines[0] : '';
            const views = numLines.length >= 2 ? numLines[1] : '';
            results.push({ project_title: title, author, views, favorites, project_url: projectUrl });
        }
        return results;
    }""", max_results)

    # ── Print results ─────────────────────────────────────────────────
    print("\\n" + "=" * 60)
    print(f'Instructables - "{query}" Projects')
    print("=" * 60)
    for idx, p in enumerate(projects, 1):
        print(f"\\n{idx}. {p['project_title']}")
        print(f"   Author: {p['author']} | Views: {p['views']} | Favorites: {p['favorites']}")
        print(f"   URL: {p['project_url']}")

    print(f"\\nFound {len(projects)} projects")
    return InstructablesResult(
        projects=[InstructablesProject(**p) for p in projects]
    )


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("instructables_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = instructables_search(page, InstructablesRequest())
            print(f"\\nReturned {len(result.projects or [])} projects")
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
    console.log(`\n🌐 Navigating to ${CFG.url}...`);
    await page.goto(CFG.url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url: CFG.url, description: `Search Instructables for "${CFG.searchQuery}"` });

    const projects = await page.evaluate((maxResults) => {
      const cards = document.querySelectorAll('[class*="_ibleCard_"]');
      const results = [];
      for (const card of cards) {
        if (results.length >= maxResults) break;
        const titleEl = card.querySelector("strong");
        if (!titleEl) continue;
        const title = titleEl.innerText.trim();
        const authorEl = card.querySelector('a[href*="/member/"]');
        const author = authorEl ? authorEl.innerText.trim() : "";
        const titleLink = card.querySelector("a[href]");
        const projectUrl = titleLink ? titleLink.href : "";
        // Parse stats from innerText
        const text = card.innerText;
        const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);
        // Numeric lines are favorites and views
        const numLines = lines.filter(l => /^[\d.,]+[KMB]?$/i.test(l));
        const favorites = numLines.length >= 1 ? numLines[0] : "";
        const views = numLines.length >= 2 ? numLines[1] : "";
        results.push({ project_title: title, author, views, favorites, project_url: projectUrl });
      }
      return results;
    }, CFG.maxResults);

    recorder.record("extract", {
      instruction: "Extract DIY project cards",
      description: `Extracted ${projects.length} projects`,
      results: projects,
    });

    console.log(`\n📋 Found ${projects.length} projects:\n`);
    projects.forEach((p, i) => {
      console.log(`   ${i + 1}. ${p.project_title}`);
      console.log(`      Author: ${p.author} | Views: ${p.views} | Favorites: ${p.favorites}`);
      console.log(`      URL: ${p.project_url}`);
    });

    const dir = path.join(__dirname);
    fs.writeFileSync(path.join(dir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    console.log(`\n💾 Saved ${recorder.actions.length} actions`);

    fs.writeFileSync(path.join(dir, "instructables_search.py"), genPython(CFG, recorder));
    console.log(`🐍 Saved Python script`);

  } catch (err) {
    console.error("❌ Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
