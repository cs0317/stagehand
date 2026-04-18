const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  query: "best laptops",
  maxResults: 5,
  waits: { page: 5000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
CNET – Product Review Search
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
class ReviewRequest:
    query: str = "${cfg.query}"
    max_results: int = ${cfg.maxResults}


@dataclass
class Product:
    name: str = ""
    rating: str = ""
    price: str = ""
    summary: str = ""


@dataclass
class ReviewResult:
    products: list = field(default_factory=list)


def cnet_search(page: Page, request: ReviewRequest) -> ReviewResult:
    """Search CNET for product reviews."""
    print(f"  Query: {request.query}\\n")

    url = f"https://www.cnet.com/search/?query={quote_plus(request.query)}"
    print(f"Loading {url}...")
    checkpoint("Navigate to CNET search")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    checkpoint("Extract product listings")
    products_data = page.evaluate(r"""(maxResults) => {
        const results = [];
        const items = document.querySelectorAll(
            'article, [class*="search-result"], [class*="Card"], a[href*="/tech/"]'
        );
        const seen = new Set();
        for (const item of items) {
            if (results.length >= maxResults) break;
            const titleEl = item.querySelector('h2, h3, h4, [class*="title"], [class*="headline"]');
            const name = titleEl ? titleEl.innerText.trim() : '';
            if (!name || name.length < 5 || seen.has(name)) continue;
            seen.add(name);

            const text = item.innerText || '';
            let rating = '', price = '', summary = '';

            const ratM = text.match(/(\\d+\\.?\\d*)\\s*(?:\\/\\s*10|out of 10|stars?)/i);
            if (ratM) rating = ratM[1];

            const priceM = text.match(/\\$(\\d[\\d,]*\\.?\\d*)/);
            if (priceM) price = "$" + priceM[1];

            const descEl = item.querySelector('p, [class*="desc"], [class*="dek"]');
            if (descEl) summary = descEl.innerText.trim().slice(0, 200);

            results.push({ name, rating, price, summary });
        }
        return results;
    }""", request.max_results)

    result = ReviewResult(products=[Product(**p) for p in products_data])

    print("\\n" + "=" * 60)
    print(f"CNET: {request.query}")
    print("=" * 60)
    for p in result.products:
        print(f"  {p.name}")
        print(f"    Rating: {p.rating}  Price: {p.price}")
        print(f"    Summary: {p.summary[:80]}...")
    print(f"\\n  Total: {len(result.products)} products")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("cnet_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = cnet_search(page, ReviewRequest())
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
    const url = `https://www.cnet.com/search/?query=${encodeURIComponent(CFG.query)}`;
    console.log(`\n🌐 Searching: ${url}...`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url, description: "Search CNET" });

    const productsData = await stagehand.extract(
      "extract up to 5 product results with product name, rating, price, and summary"
    );
    console.log("\n📊 Products:", JSON.stringify(productsData, null, 2));
    recorder.record("extract", { instruction: "Extract products", results: productsData });

    const dir = path.join(__dirname);
    fs.writeFileSync(path.join(dir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    console.log(`\n💾 Saved ${recorder.actions.length} actions`);

    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(dir, "cnet_search.py"), pyCode);
    console.log("🐍 Saved Python script");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
