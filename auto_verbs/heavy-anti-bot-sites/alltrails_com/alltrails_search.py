"""
Auto-generated Playwright script (Python)
AllTrails – Trail Search
Query: "Yosemite National Park"

Generated on: 2026-04-18T04:43:31.971Z
Recorded 2 browser interactions
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
class TrailRequest:
    query: str = "Yosemite National Park"
    max_trails: int = 5


@dataclass
class Trail:
    name: str = ""
    difficulty: str = ""
    length: str = ""
    elevation_gain: str = ""
    rating: str = ""


@dataclass
class TrailResult:
    trails: list = field(default_factory=list)


def alltrails_search(page: Page, request: TrailRequest) -> TrailResult:
    """Search AllTrails for hiking trails.
    
    NOTE: AllTrails uses DataDome/CAPTCHA bot protection which blocks automated access.
    This site cannot be reliably operated by agents.
    Falling back to Google site search for partial results.
    """
    print(f"  Query: {request.query}\n")

    # AllTrails blocks automated access with DataDome CAPTCHA.
    # Fall back to Google site search for basic trail info.
    search_url = f"https://www.google.com/search?q=site%3Aalltrails.com+{quote_plus(request.query)}+trail"
    print(f"Loading {search_url}...")
    checkpoint("Google site search for AllTrails (site uses bot detection)")
    page.goto(search_url, wait_until="domcontentloaded")
    page.wait_for_timeout(3000)

    trails_data = page.evaluate(r"""(m) => {
        const r = [], s = new Set();
        for (const h of document.querySelectorAll('h3')) {
            if (r.length >= m) break;
            let t = h.innerText.trim().replace(/\s*[\|\u2013\u2014-]\s*AllTrails.*$/i, '').trim();
            if (t.length < 5 || s.has(t)) continue; s.add(t);
            let u = ''; const a = h.closest('a') || h.parentElement?.closest('a');
            if (a) u = a.href || '';
            r.push({ name: t.slice(0, 150), difficulty: '', length: '', elevation_gain: '', rating: '', url: u });
        } return r;
    }""", request.max_trails)

    result = TrailResult(trails=[Trail(name=t['name'], difficulty=t['difficulty'], length=t['length'], elevation_gain=t['elevation_gain'], rating=t['rating']) for t in trails_data])

    print("\n" + "=" * 60)
    print(f"AllTrails: {request.query}")
    print("=" * 60)
    for i, t in enumerate(trails_data, 1):
        print(f"  {i}. {t['name']}")
        if t.get('url'): print(f"     URL: {t['url']}")
    print(f"\n  Total: {len(result.trails)} trails")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("alltrails_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = alltrails_search(page, TrailRequest())
            print(f"\nReturned {len(result.trails)} trails")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
