const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  query: "air quality",
  maxResults: 5,
  waits: { page: 5000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Data.gov – Government Dataset Search
Query: "${cfg.query}"

Generated on: ${ts}
Recorded ${n} browser interactions
"""

import re
import os, sys, shutil
from dataclasses import dataclass, field
from urllib.parse import quote_plus
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class DatasetRequest:
    query: str = "${cfg.query}"
    max_results: int = ${cfg.maxResults}


@dataclass
class Dataset:
    title: str = ""
    publisher: str = ""
    description: str = ""
    url: str = ""


@dataclass
class DatasetResult:
    datasets: list = field(default_factory=list)


def datagov_search(page: Page, request: DatasetRequest) -> DatasetResult:
    """Search Data.gov for government datasets."""
    print(f"  Query: {request.query}\\n")

    url = f"https://catalog.data.gov/dataset?q={quote_plus(request.query)}"
    print(f"Loading {url}...")
    checkpoint("Navigate to Data.gov search")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    checkpoint("Extract dataset listings")
    items_data = page.evaluate(r"""(maxResults) => {
        const results = [];
        const items = document.querySelectorAll(
            '.dataset-item, .dataset-content, [class*="dataset"], li.dataset-item, .search-result'
        );
        const seen = new Set();
        for (const item of items) {
            if (results.length >= maxResults) break;
            const titleEl = item.querySelector('h2 a, h3 a, [class*="title"] a, a[href*="/dataset/"]');
            const title = titleEl ? titleEl.innerText.trim() : '';
            if (!title || title.length < 3 || seen.has(title)) continue;
            seen.add(title);

            let dUrl = '';
            if (titleEl && titleEl.href) dUrl = titleEl.href;

            const orgEl = item.querySelector('[class*="organization"], [class*="publisher"], .dataset-organization');
            const publisher = orgEl ? orgEl.innerText.trim() : '';

            const descEl = item.querySelector('p, [class*="notes"], [class*="desc"]');
            const description = descEl ? descEl.innerText.trim().slice(0, 200) : '';

            results.push({ title, publisher, description, url: dUrl });
        }
        return results;
    }""", request.max_results)

    result = DatasetResult(datasets=[Dataset(**d) for d in items_data])

    print("\\n" + "=" * 60)
    print(f"Data.gov: {request.query}")
    print("=" * 60)
    for d in result.datasets:
        print(f"  {d.title}")
        print(f"    Publisher: {d.publisher}")
        print(f"    URL: {d.url}")
        print(f"    Description: {d.description[:80]}...")
    print(f"\\n  Total: {len(result.datasets)} datasets")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("data_gov")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = datagov_search(page, DatasetRequest())
            print(f"\\nReturned {len(result.datasets)} datasets")
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
    const url = `https://catalog.data.gov/dataset?q=${encodeURIComponent(CFG.query)}`;
    console.log(`\n🌐 Searching: ${url}...`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url, description: "Search Data.gov" });

    const datasets = await stagehand.extract(
      "extract up to 5 dataset results with title, publisher/organization, description, and dataset URL"
    );
    console.log("\n📊 Datasets:", JSON.stringify(datasets, null, 2));
    recorder.record("extract", { instruction: "Extract datasets", results: datasets });

    const dir = path.join(__dirname);
    fs.writeFileSync(path.join(dir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    console.log(`\n💾 Saved ${recorder.actions.length} actions`);

    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(dir, "datagov_search.py"), pyCode);
    console.log("🐍 Saved Python script");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
