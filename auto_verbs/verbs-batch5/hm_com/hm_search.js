const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * hm.com – Clothing Search
 *
 * Searches H&M for clothing items and extracts
 * product name, price, color options, and product URL.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  url: "https://www2.hm.com/en_us/search-results.html",
  searchQuery: "winter jacket",
  maxResults: 5,
  waits: { page: 8000 },
};

// ── Python Script Generator ──────────────────────────────────────────────────
function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
hm.com – Clothing Search
Query: ${cfg.searchQuery}

Generated on: ${ts}
Recorded ${n} browser interactions

Uses Playwright's native locator API with the user's Chrome profile.
"""

import re
import os, sys, shutil, urllib.parse
from dataclasses import dataclass
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class HMSearchRequest:
    search_query: str = "${cfg.searchQuery}"
    max_results: int = ${cfg.maxResults}


@dataclass(frozen=True)
class HMProduct:
    product_name: str = ""
    price: str = ""
    color_options: str = ""
    product_url: str = ""


@dataclass(frozen=True)
class HMSearchResult:
    products: list = None  # list[HMProduct]


def hm_search(page: Page, request: HMSearchRequest) -> HMSearchResult:
    """Search H&M for clothing items."""
    query = request.search_query
    max_results = request.max_results
    print(f"  Query: {query}")
    print(f"  Max results: {max_results}\\n")

    # ── Navigate to search ────────────────────────────────────────────
    url = f"https://www2.hm.com/en_us/search-results.html?q={urllib.parse.quote_plus(query)}"
    print(f"Loading {url}...")
    checkpoint("Navigate to H&M search")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(8000)
    print(f"  Loaded: {page.url}")

    # ── Extract products ──────────────────────────────────────────────
    checkpoint("Extract product listings")
    results_data = page.evaluate(r"""(maxResults) => {
        const articles = document.querySelectorAll('article');
        const results = [];
        for (const art of articles) {
            if (results.length >= maxResults) break;
            const h3 = art.querySelector('h3');
            if (!h3) continue;
            const name = h3.textContent.trim();
            const priceMatch = art.innerText.match(/\\$(\\d[\\d,.]+)/);
            const price = priceMatch ? '$' + priceMatch[1] : '';
            const link = art.querySelector('a[href*="productpage"]');
            const url = link ? link.href : '';
            const colorMatch = art.innerText.match(/\\+(\\d+)/);
            const colors = colorMatch ? colorMatch[1] + '+ colors' : '1 color';
            results.push({ name, price, colors, url });
        }
        return results;
    }""", max_results)

    products = []
    for r in results_data:
        products.append(HMProduct(
            product_name=r.get("name", ""),
            price=r.get("price", ""),
            color_options=r.get("colors", ""),
            product_url=r.get("url", ""),
        ))

    # ── Print results ─────────────────────────────────────────────────
    print("=" * 60)
    print(f'H&M - "{query}" Products')
    print("=" * 60)
    for idx, p in enumerate(products, 1):
        print(f"\\n{idx}. {p.product_name}")
        print(f"   Price: {p.price} | Colors: {p.color_options}")
        print(f"   URL: {p.product_url}")

    print(f"\\nFound {len(products)} products")
    return HMSearchResult(products=products)


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("hm_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = hm_search(page, HMSearchRequest())
            print(f"\\nReturned {len(result.products or [])} products")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
`;
}

// ── Main ─────────────────────────────────────────────────────────────────────
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
    const query = encodeURIComponent(CFG.searchQuery);
    const url = `${CFG.url}?q=${query}`;
    console.log(`\n🌐 Navigating to ${url}...`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url, description: `Search H&M for "${CFG.searchQuery}"` });
    console.log(`   Loaded: ${page.url()}`);

    console.log(`\n🎯 Extracting up to ${CFG.maxResults} products...\n`);

    const results = await page.evaluate((maxResults) => {
      const articles = document.querySelectorAll("article");
      const out = [];
      for (const art of articles) {
        if (out.length >= maxResults) break;
        const h3 = art.querySelector("h3");
        if (!h3) continue;
        const name = h3.textContent.trim();
        const priceMatch = art.innerText.match(/\$(\d[\d,.]+)/);
        const price = priceMatch ? "$" + priceMatch[1] : "";
        const link = art.querySelector('a[href*="productpage"]');
        const url = link ? link.href : "";
        const colorMatch = art.innerText.match(/\+(\d+)/);
        const colors = colorMatch ? colorMatch[1] + "+ colors" : "1 color";
        out.push({ name, price, colors, url });
      }
      return out;
    }, CFG.maxResults);

    recorder.record("extract", {
      instruction: "Extract H&M product listings",
      description: `Extracted ${results.length} products`,
      results,
    });

    console.log(`📋 Found ${results.length} products:\n`);
    results.forEach((r, i) => {
      console.log(`   ${i + 1}. ${r.name}`);
      console.log(`      Price: ${r.price} | Colors: ${r.colors}`);
      console.log(`      URL: ${r.url}`);
    });

    const dir = path.join(__dirname);
    const actionsFile = path.join(dir, "recorded_actions.json");
    fs.writeFileSync(actionsFile, JSON.stringify(recorder.actions, null, 2));
    console.log(`\n💾 Saved ${recorder.actions.length} actions → ${actionsFile}`);

    const pyFile = path.join(dir, "hm_search.py");
    fs.writeFileSync(pyFile, genPython(CFG, recorder));
    console.log(`🐍 Saved Python script → ${pyFile}`);

  } catch (err) {
    console.error("❌ Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
