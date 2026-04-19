const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Statista – Statistics Search
 *
 * Searches for statistics: title, description, region, time period.
 */

const CFG = {
  searchQuery: "global smartphone market share",
  maxResults: 5,
  waits: { page: 8000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Statista – Statistics Search

Generated on: ${ts}
Recorded ${n} browser interactions
Uses CDP-launched Chrome to avoid bot detection.
"""

import os, sys, shutil, re
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class SearchRequest:
    search_query: str = "${cfg.searchQuery}"
    max_results: int = ${cfg.maxResults}


@dataclass
class StatResult:
    title: str = ""
    description: str = ""
    region: str = ""
    time_period: str = ""


@dataclass
class SearchResult:
    stats: List[StatResult] = field(default_factory=list)


def statista_search(page: Page, request: SearchRequest) -> SearchResult:
    """Search Statista for statistics."""
    print(f"  Query: {request.search_query}\\n")

    query_encoded = request.search_query.replace(" ", "+")
    url = f"https://www.statista.com/search/?q={query_encoded}"
    print(f"Loading {url}...")
    checkpoint("Navigate to search")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(${cfg.waits.page})

    result = SearchResult()

    checkpoint("Extract search results")
    js_code = r\\"\\"\\"(max) => {
        const body = document.body.innerText;
        const lines = body.split('\\\\n').map(l => l.trim()).filter(l => l.length > 0);
        let startIdx = 0;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].match(/\\\\d+\\\\s+results found/)) {
                startIdx = i + 2;
                break;
            }
        }
        const stats = [];
        let i = startIdx;
        while (i < lines.length && stats.length < max) {
            let line = lines[i];
            if (line === 'Premium Statistic' || line === 'Free Statistic') { i++; continue; }
            const title = line; i++;
            if (i >= lines.length) break;
            let desc = '';
            while (i < lines.length) {
                const l = lines[i];
                if (/^(Worldwide|United States|Europe|Asia|China|India|North America)/.test(l)) break;
                desc += (desc ? ' ' : '') + l; i++;
            }
            if (i >= lines.length) break;
            const region = lines[i]; i++;
            if (i >= lines.length) break;
            const timePeriod = lines[i]; i++;
            if (i < lines.length && lines[i] === 'Source information') i++;
            if (title && !title.startsWith("Didn't find")) {
                stats.push({title, description: desc.slice(0, 200), region, time_period: timePeriod});
            }
        }
        return stats;
    }\\"\\"\\"
    stats_data = page.evaluate(js_code, request.max_results)

    for sd in stats_data:
        s = StatResult()
        s.title = sd.get("title", "")
        s.description = sd.get("description", "")
        s.region = sd.get("region", "")
        s.time_period = sd.get("time_period", "")
        result.stats.append(s)

    for i, s in enumerate(result.stats, 1):
        print(f"\\n  Stat {i}:")
        print(f"    Title:   {s.title}")
        print(f"    Region:  {s.region}")
        print(f"    Period:  {s.time_period}")
        print(f"    Summary: {s.description[:100]}...")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("statista")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            request = SearchRequest()
            result = statista_search(page, request)
            print("\\n=== DONE ===")
            print(f"Found {len(result.stats)} stats")
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
    const query = CFG.searchQuery;
    const url = \`https://www.statista.com/search/?q=\${query.replace(/ /g, "+")}\`;
    console.log(\`Navigating to \${url}\`);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(CFG.waits.page);

    const result = await stagehand.extract({
      instruction: \`Extract the first \${CFG.maxResults} statistics from search results. For each get: title, description, region, and time period.\`,
      schema: {
        type: "object",
        properties: {
          stats: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                description: { type: "string" },
                region: { type: "string" },
                time_period: { type: "string" },
              },
            },
          },
        },
      },
    });

    console.log(\`\\nExtracted \${result.stats?.length || 0} stats\`);
    for (const s of result.stats || []) {
      console.log(\`\\n  Title: \${s.title}\`);
      console.log(\`  Region: \${s.region}\`);
      console.log(\`  Period: \${s.time_period}\`);
    }

    recorder.actions.push({ type: "extract", data: result });
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(__dirname, "statista_search.py"), pyCode);
    console.log("\\nSaved statista_search.py");
  } finally {
    await stagehand.close();
  }
})();
