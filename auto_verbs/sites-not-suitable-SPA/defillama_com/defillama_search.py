"""
Auto-generated Playwright script (Python)
DefiLlama – Browse top DeFi protocols by total value locked
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
    max_results: int = 10


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
    print(f"  Max results: {request.max_results}\n")

    url = "https://defillama.com/"
    print(f"Loading {url}...")
    checkpoint("Navigate to DefiLlama homepage")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(8000)

    result = DefillamaSearchResult()

    checkpoint("Extract protocol listings from TVL table")
    js_code = """(max) => {
        const items = [];
        const seen = new Set();
        
        // Look for table rows with actual data
        const rows = document.querySelectorAll('table tbody tr');
        for (const row of rows) {
            if (items.length >= max) break;
            const cells = row.querySelectorAll('td');
            if (cells.length < 3) continue;
            
            const texts = Array.from(cells).map(c => c.textContent.trim());
            
            // Find the name - usually has a link
            const nameEl = row.querySelector('td a');
            const name = nameEl ? nameEl.textContent.trim() : texts[1] || '';
            if (!name || name.length < 2 || seen.has(name)) continue;
            seen.add(name);
            
            // Find dollar amounts for TVL
            let tvl = '';
            for (const t of texts) {
                if (t.startsWith('$') && t.length > 3) { tvl = t; break; }
            }
            
            // Find percentage changes
            const pcts = texts.filter(t => t.match(/^[+-]?\\d+\\.\\d+%$/));
            
            items.push({
                rank: texts[0] || '',
                protocol_name: name,
                chain: '',
                tvl: tvl,
                change_1d: pcts[0] || '',
                change_7d: pcts[1] || '',
                mcap_tvl_ratio: '',
                category: ''
            });
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
        print(f"\n  Protocol {i}:")
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
            print("\n=== DONE ===")
            print(f"Found {len(result.items)} protocols")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
