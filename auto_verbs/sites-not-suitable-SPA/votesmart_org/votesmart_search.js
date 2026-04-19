const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Vote Smart – Search for politician voting records
 */

const CFG = {
  searchQuery: "senator",
  maxResults: 5,
  waits: { page: 5000, action: 2000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Vote Smart – Search for politician voting records

Generated on: ${ts}
Recorded ${n} browser interactions
"""

import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class VotesmartSearchRequest:
    search_query: str = "${cfg.searchQuery}"
    max_results: int = ${cfg.maxResults}


@dataclass
class VotesmartPoliticianItem:
    politician_name: str = ""
    party: str = ""
    office: str = ""
    state: str = ""
    voting_record_url: str = ""


@dataclass
class VotesmartSearchResult:
    items: List[VotesmartPoliticianItem] = field(default_factory=list)


# Search for politician voting records on Vote Smart.
def votesmart_search(page: Page, request: VotesmartSearchRequest) -> VotesmartSearchResult:
    """Search for politician voting records on Vote Smart."""
    print(f"  Query: {request.search_query}\\n")

    query = request.search_query.replace(" ", "+")
    url = f"https://justfacts.votesmart.org/search?q={query}"
    print(f"Loading {url}...")
    checkpoint("Navigate to Vote Smart search results")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    result = VotesmartSearchResult()

    checkpoint("Extract politician listings")
    js_code = """(max) => {
        const rows = document.querySelectorAll('tr, [class*="candidate"], [class*="Candidate"], [class*="result"], [class*="official"], article');
        const items = [];
        for (const row of rows) {
            if (items.length >= max) break;
            const nameEl = row.querySelector('a, [class*="name"], [class*="Name"], h3, h4');
            const partyEl = row.querySelector('[class*="party"], [class*="Party"], td:nth-child(2)');
            const officeEl = row.querySelector('[class*="office"], [class*="Office"], td:nth-child(3)');
            const stateEl = row.querySelector('[class*="state"], [class*="State"], td:nth-child(4)');
            const linkEl = row.querySelector('a[href]');

            const politician_name = nameEl ? nameEl.textContent.trim() : '';
            const party = partyEl ? partyEl.textContent.trim() : '';
            const office = officeEl ? officeEl.textContent.trim() : '';
            const state = stateEl ? stateEl.textContent.trim() : '';
            const voting_record_url = linkEl ? linkEl.href : '';

            if (politician_name && politician_name.length > 1) {
                items.push({politician_name, party, office, state, voting_record_url});
            }
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = VotesmartPoliticianItem()
        item.politician_name = d.get("politician_name", "")
        item.party = d.get("party", "")
        item.office = d.get("office", "")
        item.state = d.get("state", "")
        item.voting_record_url = d.get("voting_record_url", "")
        result.items.append(item)

    for i, item in enumerate(result.items, 1):
        print(f"\\n  Politician {i}:")
        print(f"    Name:   {item.politician_name}")
        print(f"    Party:  {item.party}")
        print(f"    Office: {item.office}")
        print(f"    State:  {item.state}")
        print(f"    URL:    {item.voting_record_url}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("votesmart")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            request = VotesmartSearchRequest()
            result = votesmart_search(page, request)
            print("\\n=== DONE ===")
            print(f"Found {len(result.items)} politicians")
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
    const query = CFG.searchQuery.replace(/ /g, "+");
    const url = `https://justfacts.votesmart.org/search?q=${query}`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    recorder.record("navigate", url, `Navigate to ${url}`);
    await page.waitForTimeout(CFG.waits.page);

    const data = await stagehand.extract(
      `Extract the first ${CFG.maxResults} politician results. For each get the politician name, party, office, state, and voting record URL.`
    );
    recorder.record("extract", "politician listings", JSON.stringify(data));
    console.log("Extracted:", JSON.stringify(data, null, 2));

    const outDir = __dirname;
    fs.writeFileSync(path.join(outDir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    fs.writeFileSync(path.join(outDir, "votesmart_search.py"), genPython(CFG, recorder));
    console.log("Saved votesmart_search.py");
  } finally {
    await stagehand.close();
  }
})();
