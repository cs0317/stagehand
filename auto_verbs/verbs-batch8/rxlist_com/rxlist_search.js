const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * RxList – Search for medication information by keyword
 */

const CFG = {
  searchQuery: "ibuprofen",
  maxResults: 5,
  waits: { page: 5000, action: 2000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
RxList – Search for medication information by keyword

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
class RxlistSearchRequest:
    search_query: str = "${cfg.searchQuery}"
    max_results: int = ${cfg.maxResults}


@dataclass
class RxlistDrugItem:
    drug_name: str = ""
    generic_name: str = ""
    drug_class: str = ""
    uses: str = ""
    side_effects: str = ""
    dosage_forms: str = ""


@dataclass
class RxlistSearchResult:
    items: List[RxlistDrugItem] = field(default_factory=list)


# Search for medication information on RxList by keyword.
def rxlist_search(page: Page, request: RxlistSearchRequest) -> RxlistSearchResult:
    """Search for medication information on RxList."""
    print(f"  Query: {request.search_query}\\n")

    query = request.search_query.replace(" ", "+")
    url = f"https://www.rxlist.com/search/rxlist/{query}"
    print(f"Loading {url}...")
    checkpoint("Navigate to RxList search results")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    result = RxlistSearchResult()

    checkpoint("Extract drug listings")
    js_code = """(max) => {
        const cards = document.querySelectorAll('[class*="search-result"], [class*="SearchResult"], [class*="drug"], article, .result, li[class*="result"]');
        const items = [];
        for (const card of cards) {
            if (items.length >= max) break;
            const nameEl = card.querySelector('h2, h3, a, [class*="title"], [class*="name"]');
            const genericEl = card.querySelector('[class*="generic"], [class*="Generic"]');
            const classEl = card.querySelector('[class*="class"], [class*="category"]');
            const usesEl = card.querySelector('[class*="uses"], [class*="indication"]');
            const sideEl = card.querySelector('[class*="side"], [class*="adverse"]');
            const dosageEl = card.querySelector('[class*="dosage"], [class*="form"]');
            const descEl = card.querySelector('p, [class*="description"], [class*="summary"]');

            const drug_name = nameEl ? nameEl.textContent.trim() : '';
            const generic_name = genericEl ? genericEl.textContent.trim() : '';
            const drug_class = classEl ? classEl.textContent.trim() : '';
            const uses = usesEl ? usesEl.textContent.trim() : (descEl ? descEl.textContent.trim() : '');
            const side_effects = sideEl ? sideEl.textContent.trim() : '';
            const dosage_forms = dosageEl ? dosageEl.textContent.trim() : '';

            if (drug_name) {
                items.push({drug_name, generic_name, drug_class, uses, side_effects, dosage_forms});
            }
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = RxlistDrugItem()
        item.drug_name = d.get("drug_name", "")
        item.generic_name = d.get("generic_name", "")
        item.drug_class = d.get("drug_class", "")
        item.uses = d.get("uses", "")
        item.side_effects = d.get("side_effects", "")
        item.dosage_forms = d.get("dosage_forms", "")
        result.items.append(item)

    for i, item in enumerate(result.items, 1):
        print(f"\\n  Drug {i}:")
        print(f"    Name:         {item.drug_name}")
        print(f"    Generic:      {item.generic_name}")
        print(f"    Class:        {item.drug_class}")
        print(f"    Uses:         {item.uses[:100]}...")
        print(f"    Side Effects: {item.side_effects[:100]}...")
        print(f"    Dosage Forms: {item.dosage_forms}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("rxlist")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            request = RxlistSearchRequest()
            result = rxlist_search(page, request)
            print("\\n=== DONE ===")
            print(f"Found {len(result.items)} drugs")
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
    const url = `https://www.rxlist.com/search/rxlist/${query}`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    recorder.record("navigate", url, `Navigate to ${url}`);
    await page.waitForTimeout(CFG.waits.page);

    const data = await stagehand.extract(
      `Extract the first ${CFG.maxResults} drug search results. For each get the drug name, generic name, drug class, uses, side effects, and dosage forms.`
    );
    recorder.record("extract", "drug listings", JSON.stringify(data));
    console.log("Extracted:", JSON.stringify(data, null, 2));

    const outDir = __dirname;
    fs.writeFileSync(path.join(outDir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    fs.writeFileSync(path.join(outDir, "rxlist_search.py"), genPython(CFG, recorder));
    console.log("Saved rxlist_search.py");
  } finally {
    await stagehand.close();
  }
})();
