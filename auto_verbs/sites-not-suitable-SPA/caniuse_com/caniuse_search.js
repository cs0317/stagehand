const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Can I Use – Search browser compatibility data
 */

const CFG = {
  featureQuery: "flexbox",
  waits: { page: 5000, action: 2000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Can I Use – Search browser compatibility data

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
class CaniuseSearchRequest:
    feature_query: str = "${cfg.featureQuery}"


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
    print(f"  Feature query: {request.feature_query}\\n")

    import urllib.parse
    encoded = urllib.parse.quote_plus(request.feature_query)
    url = f"https://caniuse.com/?search={encoded}"
    print(f"Loading {url}...")
    checkpoint("Navigate to Can I Use search")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    result = CaniuseSearchResult()

    checkpoint("Extract browser compatibility data")
    js_code = """() => {
        const features = document.querySelectorAll('[class*="feature"], [class*="Feature"], .feature, article, [id*="feat-"]');
        const items = [];
        for (const feat of features) {
            const nameEl = feat.querySelector('h2, h3, h4, [class*="title"], [class*="name"], a');
            const name = nameEl ? nameEl.textContent.trim() : '';
            if (!name) continue;

            const descEl = feat.querySelector('[class*="desc"], [class*="description"], p');
            const description = descEl ? descEl.textContent.trim() : '';

            const usageEl = feat.querySelector('[class*="usage"], [class*="percent"], [class*="global"]');
            const usage = usageEl ? usageEl.textContent.trim() : '';

            const getBrowserSupport = (browser) => {
                const el = feat.querySelector(\`[class*="\${browser}"], [title*="\${browser}" i], [data-browser*="\${browser}" i]\`);
                return el ? el.textContent.trim() || el.getAttribute('title') || '' : '';
            };

            items.push({
                feature_name: name,
                description: description,
                usage_percentage: usage,
                chrome_support: getBrowserSupport('chrome'),
                firefox_support: getBrowserSupport('firefox'),
                safari_support: getBrowserSupport('safari'),
                edge_support: getBrowserSupport('edge')
            });
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
        print(f"\\n  Feature {i}:")
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
            print("\\n=== DONE ===")
            print(f"Found {len(result.items)} features")
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
    const encoded = encodeURIComponent(CFG.featureQuery);
    const url = `https://caniuse.com/?search=${encoded}`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    recorder.record("navigate", url, `Navigate to ${url}`);
    await page.waitForTimeout(CFG.waits.page);

    const data = await stagehand.extract(
      `Extract browser compatibility features from the search results. For each feature get the name, description, global usage percentage, and support status for Chrome, Firefox, Safari, and Edge.`
    );
    recorder.record("extract", "compatibility data", JSON.stringify(data));
    console.log("Extracted:", JSON.stringify(data, null, 2));

    const outDir = __dirname;
    fs.writeFileSync(path.join(outDir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    fs.writeFileSync(path.join(outDir, "caniuse_search.py"), genPython(CFG, recorder));
    console.log("Saved caniuse_search.py");
  } finally {
    await stagehand.close();
  }
})();
