const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Substack – Newsletter Search
 *
 * Searches for newsletters: name, handle, description.
 */

const CFG = {
  searchQuery: "artificial intelligence",
  maxResults: 5,
  waits: { page: 8000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Substack – Newsletter Search

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
class NewsletterResult:
    name: str = ""
    handle: str = ""
    description: str = ""


@dataclass
class SearchResult:
    newsletters: List[NewsletterResult] = field(default_factory=list)


def substack_search(page: Page, request: SearchRequest) -> SearchResult:
    """Search Substack for newsletters."""
    print(f"  Query: {request.search_query}\\n")

    query_encoded = request.search_query.replace(" ", "%20")
    url = f"https://substack.com/search/{query_encoded}?type=publications"
    print(f"Loading {url}...")
    checkpoint("Navigate to search")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(${cfg.waits.page})

    result = SearchResult()

    checkpoint("Extract newsletter results")
    js_code = r\\"\\"\\"(max) => {
        const body = document.body.innerText;
        const lines = body.split('\\\\n').map(l => l.trim()).filter(l => l.length > 0);
        const newsletters = [];
        let i = 0;
        for (; i < lines.length; i++) {
            if (lines[i] === 'People') { i++; break; }
        }
        while (i < lines.length && newsletters.length < max) {
            const name = lines[i];
            if (/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\\\\s+\\\\d/.test(name)) break;
            if (name === 'Follow') { i++; continue; }
            if (i + 1 < lines.length && lines[i + 1].includes('@')) {
                const handleLine = lines[i + 1];
                const handleMatch = handleLine.match(/@(\\\\w+)/);
                const handle = handleMatch ? '@' + handleMatch[1] : '';
                i += 2;
                let desc = '';
                if (i < lines.length && lines[i] !== 'Follow') { desc = lines[i]; i++; }
                if (i < lines.length && lines[i] === 'Follow') i++;
                newsletters.push({name, handle, description: desc});
            } else { i++; }
        }
        return newsletters;
    }\\"\\"\\"
    newsletters_data = page.evaluate(js_code, request.max_results)

    for nd in newsletters_data:
        n = NewsletterResult()
        n.name = nd.get("name", "")
        n.handle = nd.get("handle", "")
        n.description = nd.get("description", "")
        result.newsletters.append(n)

    for i, n in enumerate(result.newsletters, 1):
        print(f"\\n  Newsletter {i}:")
        print(f"    Name:        {n.name}")
        print(f"    Handle:      {n.handle}")
        print(f"    Description: {n.description[:100]}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("substack")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            request = SearchRequest()
            result = substack_search(page, request)
            print("\\n=== DONE ===")
            print(f"Found {len(result.newsletters)} newsletters")
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
    const url = \`https://substack.com/search/\${encodeURIComponent(query)}?type=publications\`;
    console.log(\`Navigating to \${url}\`);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(CFG.waits.page);

    const result = await stagehand.extract({
      instruction: \`Extract the first \${CFG.maxResults} newsletter results. For each get: newsletter name, author handle, and description.\`,
      schema: {
        type: "object",
        properties: {
          newsletters: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                handle: { type: "string" },
                description: { type: "string" },
              },
            },
          },
        },
      },
    });

    console.log(\`\\nExtracted \${result.newsletters?.length || 0} newsletters\`);
    for (const n of result.newsletters || []) {
      console.log(\`\\n  Name: \${n.name}\`);
      console.log(\`  Handle: \${n.handle}\`);
      console.log(\`  Desc: \${n.description}\`);
    }

    recorder.actions.push({ type: "extract", data: result });
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(__dirname, "substack_search.py"), pyCode);
    console.log("\\nSaved substack_search.py");
  } finally {
    await stagehand.close();
  }
})();
