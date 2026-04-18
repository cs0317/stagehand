const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Zara – Product Search
 *
 * Searches zara.com for clothing products and extracts
 * product name, price, and product URL.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  query: "denim jacket",
  maxProducts: 5,
  waits: { page: 10000 },
};

// ── Python Script Generator ──────────────────────────────────────────────────
function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Zara – Product Search
Query: "${cfg.query}"

Generated on: ${ts}
Recorded ${n} browser interactions

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
class ZaraRequest:
    query: str = "${cfg.query}"
    max_products: int = ${cfg.maxProducts}


@dataclass
class ZaraProduct:
    product_name: str = ""
    price: str = ""
    product_url: str = ""


@dataclass
class ZaraResult:
    products: list = field(default_factory=list)


def zara_search(page: Page, request: ZaraRequest) -> ZaraResult:
    """Search Zara for clothing products."""
    print(f"  Query: {request.query}\\n")

    # ── Search ────────────────────────────────────────────────────────
    search_url = f"https://www.zara.com/us/en/search?searchTerm={quote_plus(request.query)}&section=WOMAN"
    print(f"Loading {search_url}...")
    checkpoint("Navigate to Zara search")
    page.goto(search_url, wait_until="domcontentloaded")
    page.wait_for_timeout(${cfg.waits.page})

    # ── Extract products ──────────────────────────────────────────────
    raw_products = page.evaluate(r"""(maxProducts) => {
        const items = document.querySelectorAll('[data-productid]');
        const results = [];
        const seenUrls = new Set();
        for (const item of items) {
            if (results.length >= maxProducts) break;
            const link = item.querySelector('a');
            const url = link ? link.href : '';
            // Deduplicate by URL (same product in different colors)
            if (seenUrls.has(url)) continue;
            seenUrls.add(url);
            const lines = item.innerText.split(String.fromCharCode(10)).filter(l => l.trim());
            if (lines.length < 2) continue;
            const name = lines[0].trim();
            // Price is the second non-empty line
            let price = '';
            for (let i = 1; i < lines.length; i++) {
                if (/\\$/.test(lines[i])) { price = lines[i].trim(); break; }
            }
            if (!price) continue;
            results.push({ product_name: name, price, product_url: url });
        }
        return results;
    }""", request.max_products)

    # ── Print results ─────────────────────────────────────────────────
    print("\\n" + "=" * 60)
    print(f"Zara: {request.query}")
    print("=" * 60)
    for idx, p in enumerate(raw_products, 1):
        print(f"\\n  {idx}. {p['product_name']}")
        print(f"     Price: {p['price']}")
        print(f"     URL:   {p['product_url']}")

    products = [ZaraProduct(**p) for p in raw_products]
    return ZaraResult(products=products)


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("zara_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = zara_search(page, ZaraRequest())
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
    const searchUrl = `https://www.zara.com/us/en/search?searchTerm=${encodeURIComponent(CFG.query)}&section=WOMAN`;
    console.log(`\n🌐 Searching: ${searchUrl}...`);
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url: searchUrl, description: "Search Zara" });

    const products = await page.evaluate((maxProducts) => {
      const items = document.querySelectorAll("[data-productid]");
      const results = [];
      const seenUrls = new Set();
      for (const item of items) {
        if (results.length >= maxProducts) break;
        const link = item.querySelector("a");
        const url = link ? link.href : "";
        if (seenUrls.has(url)) continue;
        seenUrls.add(url);
        const lines = item.innerText.split("\n").filter(l => l.trim());
        if (lines.length < 2) continue;
        const name = lines[0].trim();
        let price = "";
        for (let i = 1; i < lines.length; i++) {
          if (/\$/.test(lines[i])) { price = lines[i].trim(); break; }
        }
        if (!price) continue;
        results.push({ product_name: name, price, product_url: url });
      }
      return results;
    }, CFG.maxProducts);

    recorder.record("extract", {
      instruction: "Extract Zara products",
      description: `Extracted ${products.length} products`,
      results: products,
    });

    console.log("\n" + "=".repeat(60));
    console.log(`Zara: ${CFG.query}`);
    console.log("=".repeat(60));
    products.forEach((p, i) => {
      console.log(`\n  ${i + 1}. ${p.product_name}`);
      console.log(`     Price: ${p.price}`);
      console.log(`     URL:   ${p.product_url}`);
    });

  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    const dir = path.join(__dirname);
    fs.writeFileSync(
      path.join(dir, "recorded_actions.json"),
      JSON.stringify(recorder.actions, null, 2)
    );
    console.log(`\n💾 Saved ${recorder.actions.length} actions`);

    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(dir, "zara_search.py"), pyCode);
    console.log("🐍 Saved Python script");

    await stagehand.close();
    process.exit(0);
  }
})();
