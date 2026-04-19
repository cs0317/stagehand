"""
Auto-generated Playwright script (Python)
Athlinks – Search Race Results
Race: "Boston Marathon"

Uses Playwright's native locator API with the user's Chrome profile.
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
class AthlinksRequest:
    race_name: str = "Boston Marathon"
    max_results: int = 5


@dataclass
class RaceResult:
    runner_name: str = ""
    bib_number: str = ""
    finish_time: str = ""
    overall_place: str = ""
    age_group: str = ""
    age_group_place: str = ""


@dataclass
class AthlinksResult:
    results: list = field(default_factory=list)


def athlinks_search(page: Page, request: AthlinksRequest) -> AthlinksResult:
    """Search athlinks.com for race results."""
    print(f"  Race: {request.race_name}\n")

    # ── Search ────────────────────────────────────────────────────────
    search_url = f"https://www.athlinks.com/search?query={quote_plus(request.race_name)}"
    print(f"Loading {search_url}...")
    checkpoint("Navigate to Athlinks search")
    page.goto(search_url, wait_until="domcontentloaded")
    page.wait_for_timeout(8000)

    # ── Extract event search results directly ─────────────────────────
    raw_results = page.evaluate(r"""(maxResults) => {
        const results = [];
        const seen = new Set();
        
        // Look for any links or cards that look like events
        const links = document.querySelectorAll('a[href*="/event/"], a[href*="/race/"]');
        for (const a of links) {
            if (results.length >= maxResults) break;
            const text = a.innerText.trim();
            if (text.length < 5 || seen.has(text)) continue;
            seen.add(text);
            
            const card = a.closest('li, div') || a;
            const fullText = card.innerText.trim();
            const lines = fullText.split('\n').filter(l => l.trim());
            
            results.push({
                runner_name: lines[0] || text,
                bib_number: '',
                finish_time: '',
                overall_place: '',
                age_group: lines.length > 1 ? lines[1] : '',
                age_group_place: '',
            });
        }
        
        // Fallback: try headings
        if (results.length === 0) {
            const headings = document.querySelectorAll('h2, h3, h4');
            for (const h of headings) {
                if (results.length >= maxResults) break;
                const text = h.innerText.trim();
                if (text.length > 5 && !seen.has(text)) {
                    seen.add(text);
                    results.push({
                        runner_name: text,
                        bib_number: '', finish_time: '', overall_place: '',
                        age_group: '', age_group_place: '',
                    });
                }
            }
        }
        
        return results;
    }""", request.max_results)

    # ── Print results ─────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print(f"Athlinks: {request.race_name}")
    print("=" * 60)
    for idx, r in enumerate(raw_results, 1):
        print(f"\n  {idx}. {r['runner_name']}")
        print(f"     Bib: {r['bib_number']}")
        print(f"     Time: {r['finish_time']}")
        print(f"     Overall: {r['overall_place']}")
        if r['age_group']:
            print(f"     Age Group: {r['age_group']} (Place: {r['age_group_place']})")

    results = [RaceResult(**r) for r in raw_results]
    return AthlinksResult(results=results)


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("athlinks_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = athlinks_search(page, AthlinksRequest())
            print(f"\nReturned {len(result.results)} results")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
