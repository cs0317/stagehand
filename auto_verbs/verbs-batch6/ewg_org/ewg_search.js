const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  query: "sunscreen",
  maxResults: 5,
  waits: { page: 5000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
EWG Skin Deep – Product Search
Query: "${cfg.query}"

Generated on: ${ts}
Recorded ${n} browser interactions
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
class ProductRequest:
    query: str = "${cfg.query}"
    max_results: int = ${cfg.maxResults}


@dataclass
class Product:
    name: str = ""
    brand: str = ""
    hazard_score: str = ""
    concerns: str = ""


@dataclass
class ProductResult:
    products: list = field(default_factory=list)


def ewg_search(page: Page, request: ProductRequest) -> ProductResult:
    """Search EWG Skin Deep for products."""
    print(f"  Query: {request.query}\\n")

    url = f"https://www.ewg.org/skindeep/search/?search={quote_plus(request.query)}"
    print(f"Loading {url}...")
    checkpoint("Navigate to EWG Skin Deep search")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    checkpoint("Extract product listings")
    items_data = page.evaluate(r"""(maxResults) => {
        const results = [];
        const items = document.querySelectorAll(
            '[class*="product-tile"], [class*="product-card"], article, .search-result, tr, li'
        );
        const seen = new Set();
        for (const item of items) {
            if (results.length >= maxResults) break;
            const titleEl = item.querySelector('a[href*="/product/"], h3, h4, [class*="product-name"], [class*="title"]');
            const name = titleEl ? titleEl.innerText.trim() : '';
            if (!name || name.length < 3 || seen.has(name)) continue;
            seen.add(name);

            const text = item.innerText || '';
            let brand = '', hazard_score = '', concerns = '';

            const brandEl = item.querySelector('[class*="brand"], [class*="company"]');
            if (brandEl) brand = brandEl.innerText.trim();

            const scoreM = text.match(/(\\d+)\\s*(?:\\/\\s*10|hazard|score|EWG)/i);
            if (scoreM) hazard_score = scoreM[1];

            const concernEl = item.querySelector('[class*="concern"], [class*="warning"]');
            if (concernEl) concerns = concernEl.innerText.trim().slice(0, 200);

            results.push({ name, brand, hazard_score, concerns });
        }
        return results;
    }""", request.max_results)

    result = ProductResult(products=[Product(**p) for p in items_data])

    print("\\n" + "=" * 60)
    print(f"EWG Skin Deep: {request.query}")
    print("=" * 60)
    for p in result.products:
        print(f"  {p.name}")
        print(f"    Brand: {p.brand}  Score: {p.hazard_score}")
        print(f"    Concerns: {p.concerns[:80]}...")
    print(f"\\n  Total: {len(result.products)} products")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("ewg_org")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = ewg_search(page, ProductRequest())
            print(f"\\nReturned {len(result.products)} products")
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
  const stagehand = new Stagehand({
    env: "LOCAL",
    verbose: 1,
    llmClient,
    localBrowserLaunchOptions: {
      headless: false,
      args: ["--disable-blink-features=AutomationControlled", "--start-maximized"],
    },
  });
  await stagehand.init();
  const page = stagehand.context.pages()[0];
  const recorder = new PlaywrightRecorder();

  try {
    const url = `https://www.ewg.org/skindeep/search/?search=${encodeURIComponent(CFG.query)}`;
    console.log(`\n🌐 Searching: ${url}...`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url, description: "Search EWG Skin Deep" });

    const products = await stagehand.extract(
      "extract up to 5 product results with product name, brand, EWG hazard score (1-10), and key concerns"
    );
    console.log("\n📊 Products:", JSON.stringify(products, null, 2));
    recorder.record("extract", { instruction: "Extract products", results: products });

    const dir = path.join(__dirname);
    fs.writeFileSync(path.join(dir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    console.log(`\n💾 Saved ${recorder.actions.length} actions`);

    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(dir, "ewg_search.py"), pyCode);
    console.log("🐍 Saved Python script");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
