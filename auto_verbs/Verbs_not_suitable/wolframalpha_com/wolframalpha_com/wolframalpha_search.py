"""
Wolfram Alpha – Query for computational answers

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
class WolframalphaSearchRequest:
    query: str = "population of Tokyo"


@dataclass
class WolframalphaPodItem:
    pod_title: str = ""
    pod_value: str = ""


@dataclass
class WolframalphaSearchResult:
    query_input: str = ""
    result_pods: List[WolframalphaPodItem] = field(default_factory=list)


def wolframalpha_search(page: Page, request: WolframalphaSearchRequest) -> WolframalphaSearchResult:
    """Query Wolfram Alpha for computational answers."""
    print(f"  Query: {request.query}\n")

    query = request.query.replace(" ", "+")
    url = f"https://www.wolframalpha.com/input?i={query}"
    print(f"Loading {url}...")
    checkpoint("Navigate to Wolfram Alpha results")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(8000)

    result = WolframalphaSearchResult()
    result.query_input = request.query

    checkpoint("Extract result pods")
    js_code = """() => {
        const items = [];
        const h2s = document.querySelectorAll('h2');
        for (const h2 of h2s) {
            const title = h2.innerText.trim();
            if (!title || title.length < 3) continue;
            if (title.match(/^(Privacy|Cookie|Sign|Menu|Search|Filter)/i)) continue;
            const container = h2.closest('section, div') || h2.parentElement;
            const text = container ? container.innerText : '';
            const lines = text.split('\\n').map(l => l.trim()).filter(l => l.length > 0 && l !== title);
            const value = lines.slice(0, 3).join('; ');
            items.push({ pod_title: title, pod_value: value });
        }
        return items;
    }"""
    pods_data = page.evaluate(js_code)

    for d in pods_data:
        item = WolframalphaPodItem()
        item.pod_title = d.get("pod_title", "")
        item.pod_value = d.get("pod_value", "")
        result.result_pods.append(item)

    print(f"  Input: {result.query_input}")
    for i, pod in enumerate(result.result_pods, 1):
        print(f"\n  Pod {i}:")
        print(f"    Title: {pod.pod_title}")
        print(f"    Value: {pod.pod_value[:200]}...")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("wolframalpha")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            request = WolframalphaSearchRequest()
            result = wolframalpha_search(page, request)
            print("\n=== DONE ===")
            print(f"Found {len(result.result_pods)} pods")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
