"""
Can I Use – Search browser compatibility data

Uses CDP-launched Chrome to avoid bot detection.
"""

import os, sys, shutil
import urllib.parse
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class CaniuseSearchRequest:
    feature_query: str = "flexbox"


@dataclass
class CaniuseFeatureItem:
    feature_name: str = ""
    description: str = ""
    usage_percentage: str = ""
    chrome_support: str = ""
    firefox_support: str = ""
    safari_support: str = ""
    edge_support: str = ""


@dataclass
class CaniuseSearchResult:
    items: List[CaniuseFeatureItem] = field(default_factory=list)


# Search browser compatibility data on Can I Use.
def caniuse_search(page: Page, request: CaniuseSearchRequest) -> CaniuseSearchResult:
    """Search browser compatibility data on Can I Use."""
    print(f"  Feature query: {request.feature_query}\n")

    encoded = urllib.parse.quote_plus(request.feature_query)
    url = f"https://caniuse.com/?search={encoded}"
    print(f"Loading {url}...")
    checkpoint("Navigate to Can I Use search")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(8000)

    result = CaniuseSearchResult()

    checkpoint("Extract browser compatibility data")
    js_code = """() => {
        const items = [];
        const seen = new Set();
        
        // Strategy 1: links to feature pages
        const links = document.querySelectorAll('a[href]');
        for (const a of links) {
            if (items.length >= 5) break;
            const href = a.getAttribute('href') || '';
            // caniuse feature links look like /css-flexbox or #feat=flexbox
            if (!href.match(/^\\/?[a-z]/) && !href.includes('feat=')) continue;
            
            const text = a.innerText.trim();
            if (text.length < 3 || text.length > 100 || seen.has(text)) continue;
            
            const card = a.closest('li, div, section') || a;
            const fullText = card.innerText.trim();
            
            let desc = '';
            let usage = '';
            const lines = fullText.split('\\n').filter(l => l.trim());
            for (const line of lines) {
                if (line.match(/\\d+(\\.\\d+)?%/)) usage = line.match(/[\\d.]+%/)[0];
                if (line.length > 20 && line !== text && !desc) desc = line.substring(0, 200);
            }
            
            if (text.length > 3) {
                seen.add(text);
                items.push({
                    feature_name: text,
                    description: desc,
                    usage_percentage: usage,
                    chrome_support: '', firefox_support: '', safari_support: '', edge_support: ''
                });
            }
        }
        
        // Strategy 2: any text blocks with percentage
        if (items.length === 0) {
            const allText = document.body.innerText;
            const featureName = document.querySelector('h1, h2, h3');
            if (featureName) {
                const pctMatch = allText.match(/([\\d.]+)%/);
                items.push({
                    feature_name: featureName.innerText.trim(),
                    description: '',
                    usage_percentage: pctMatch ? pctMatch[0] : '',
                    chrome_support: '', firefox_support: '', safari_support: '', edge_support: ''
                });
            }
        }
        
        return items;
    }"""
    items_data = page.evaluate(js_code)

    for d in items_data:
        item = CaniuseFeatureItem()
        item.feature_name = d.get("feature_name", "")
        item.description = d.get("description", "")
        item.usage_percentage = d.get("usage_percentage", "")
        item.chrome_support = d.get("chrome_support", "")
        item.firefox_support = d.get("firefox_support", "")
        item.safari_support = d.get("safari_support", "")
        item.edge_support = d.get("edge_support", "")
        result.items.append(item)

    for i, item in enumerate(result.items, 1):
        print(f"\n  Feature {i}:")
        print(f"    Name:        {item.feature_name}")
        print(f"    Description: {item.description[:80]}")
        print(f"    Usage:       {item.usage_percentage}")
        print(f"    Chrome:      {item.chrome_support}")
        print(f"    Firefox:     {item.firefox_support}")
        print(f"    Safari:      {item.safari_support}")
        print(f"    Edge:        {item.edge_support}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("caniuse")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            request = CaniuseSearchRequest()
            result = caniuse_search(page, request)
            print("\n=== DONE ===")
            print(f"Found {len(result.items)} features")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
