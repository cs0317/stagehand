const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * DefiLlama – Browse top DeFi protocols by total value locked
 */

const CFG = {
  maxResults: 10,
  waits: { page: 5000, action: 2000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
DefiLlama – Browse top DeFi protocols by total value locked

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
class DefillamaSearchRequest:
    max_results: int = ${cfg.maxResults}


@dataclass
class DefillamaProtocolItem:
    rank: str = ""
    protocol_name: str = ""
    chain: str = ""
    tvl: str = ""
    change_1d: str = ""
    change_7d: str = ""
    mcap_tvl_ratio: str = ""
    category: str = ""


@dataclass
class DefillamaSearchResult:
    items: List[DefillamaProtocolItem] = field(default_factory=list)


# Browse top DeFi protocols by total value locked on DefiLlama.
def defillama_search(page: Page, request: DefillamaSearchRequest) -> DefillamaSearchResult:
    """Browse top DeFi protocols by total value locked on DefiLlama."""
    print(f"  Max results: {request.max_results}\\n")

    url = "https://defillama.com/"
    print(f"Loading {url}...")
    checkpoint("Navigate to DefiLlama homepage")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    result = DefillamaSearchResult()

    checkpoint("Extract protocol listings from TVL table")
    js_code = """(max) => {
        const rows = document.querySelectorAll('table tbody tr, [class*="row"], [class*="protocol"], [class*="item"]');
        const items = [];
        for (const row of rows) {
            if (items.length >= max) break;
            const cells = row.querySelectorAll('td, [class*="cell"], [class*="col"]');
            const nameEl = row.querySelector('a[class*="name"], a[class*="protocol"], [class*="name"] a, td:nth-child(2) a, a');
            const categoryEl = row.querySelector('[class*="category"], [class*="tag"]');

            const texts = Array.from(cells).map(c => c.textContent.trim());
            const rank = texts[0] || '';
            const protocol_name = nameEl ? nameEl.textContent.trim() : (texts[1] || '');
            const chain = texts[2] || '';
            const tvl = texts.find(t => t.startsWith('$')) || texts[3] || '';
            const change_1d = texts[4] || '';
            const change_7d = texts[5] || '';
            const mcap_tvl_ratio = texts[6] || '';
            const category = categoryEl ? categoryEl.textContent.trim() : (texts[7] || '');

            if (protocol_name && protocol_name !== 'Name') {
                items.push({rank, protocol_name, chain, tvl, change_1d, change_7d, mcap_tvl_ratio, category});
            }
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = DefillamaProtocolItem()
        item.rank = d.get("rank", "")
        item.protocol_name = d.get("protocol_name", "")
        item.chain = d.get("chain", "")
        item.tvl = d.get("tvl", "")
        item.change_1d = d.get("change_1d", "")
        item.change_7d = d.get("change_7d", "")
        item.mcap_tvl_ratio = d.get("mcap_tvl_ratio", "")
        item.category = d.get("category", "")
        result.items.append(item)

    for i, item in enumerate(result.items, 1):
        print(f"\\n  Protocol {i}:")
        print(f"    Rank:         {item.rank}")
        print(f"    Name:         {item.protocol_name}")
        print(f"    Chain:        {item.chain}")
        print(f"    TVL:          {item.tvl}")
        print(f"    1d Change:    {item.change_1d}")
        print(f"    7d Change:    {item.change_7d}")
        print(f"    Mcap/TVL:     {item.mcap_tvl_ratio}")
        print(f"    Category:     {item.category}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("defillama")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            request = DefillamaSearchRequest()
            result = defillama_search(page, request)
            print("\\n=== DONE ===")
            print(f"Found {len(result.items)} protocols")
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
    const url = "https://defillama.com/";
    await page.goto(url, { waitUntil: "domcontentloaded" });
    recorder.record("navigate", url, `Navigate to ${url}`);
    await page.waitForTimeout(CFG.waits.page);

    const data = await stagehand.extract(
      `Extract the first ${CFG.maxResults} DeFi protocols from the TVL table. For each get the rank, protocol name, chain, TVL, 1d change, 7d change, mcap/tvl ratio, and category.`
    );
    recorder.record("extract", "protocol listings", JSON.stringify(data));
    console.log("Extracted:", JSON.stringify(data, null, 2));

    const outDir = __dirname;
    fs.writeFileSync(path.join(outDir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    fs.writeFileSync(path.join(outDir, "defillama_search.py"), genPython(CFG, recorder));
    console.log("Saved defillama_search.py");
  } finally {
    await stagehand.close();
  }
})();
