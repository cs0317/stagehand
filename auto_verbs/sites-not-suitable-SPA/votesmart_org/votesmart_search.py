"""
Vote Smart – Search for politician voting records

Uses CDP-launched Chrome to avoid bot detection.
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
    search_query: str = "senator"
    max_results: int = 5


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
    print(f"  Query: {request.search_query}\n")

    query = request.search_query.replace(" ", "+")
    url = f"https://justfacts.votesmart.org/officials/NA/S"
    print(f"Loading {url}...")
    checkpoint("Navigate to Vote Smart search results")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    result = VotesmartSearchResult()

    checkpoint("Extract politician listings")
    js_code = """(max) => {
        const links = document.querySelectorAll('a[href]');
        const items = [];
        const seen = new Set();
        for (const a of links) {
            if (items.length >= max) break;
            const href = a.getAttribute('href') || '';
            // Match candidate/official profile links
            if (!href.match(/votesmart\\.org\\/(candidate|officials?)\\/[^/]+\\/\\d+/)) continue;
            const text = a.textContent.trim();
            if (!text || text.length < 3 || text.length > 200) continue;
            if (seen.has(href)) continue;
            seen.add(href);
            items.push({politician_name: text, party: '', office: '', state: '', voting_record_url: href});
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
        print(f"\n  Politician {i}:")
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
            print("\n=== DONE ===")
            print(f"Found {len(result.items)} politicians")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
