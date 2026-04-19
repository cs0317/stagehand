const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * SSENSE – Designer Sneaker Search
 *
 * Extracts designer sneakers: brand, product name, price.
 */

const CFG = {
  categoryUrl: "https://www.ssense.com/en-us/men/shoes/sneakers",
  maxResults: 5,
  waits: { page: 8000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
SSENSE – Designer Sneaker Search

Generated on: ${ts}
Recorded ${n} browser interactions
Uses CDP-launched Chrome to avoid bot detection.
"""

import os, sys, shutil, re
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class SearchRequest:
    category_url: str = "${cfg.categoryUrl}"
    max_results: int = ${cfg.maxResults}


@dataclass
class ProductResult:
    brand: str = ""
    product_name: str = ""
    price: str = ""


@dataclass
class SearchResult:
    products: List[ProductResult] = field(default_factory=list)


def ssense_sneakers(page: Page, request: SearchRequest) -> SearchResult:
    """Extract designer sneakers from SSENSE."""
    print(f"  Category: {request.category_url}\\n")

    print(f"Loading {request.category_url}...")
    checkpoint("Navigate to category")
    page.goto(request.category_url, wait_until="domcontentloaded")
    page.wait_for_timeout(${cfg.waits.page})

    result = SearchResult()

    checkpoint("Extract product listings")
    js_code = r\\"\\"\\"(max) => {
        const body = document.body.innerText;
        const lines = body.split('\\\\n').map(l => l.trim()).filter(l => l.length > 0);
        let startIdx = 0;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].startsWith('SHOES FOR MEN')) {
                startIdx = i + 2;
                break;
            }
        }
        const pricePattern = /^\\\\$[\\\\d,]+$/;
        const products = [];
        let i = startIdx;
        while (i < lines.length && products.length < max) {
            const brand = lines[i]; i++;
            if (i >= lines.length) break;
            const name = lines[i]; i++;
            if (i >= lines.length) break;
            const price = lines[i]; i++;
            if (brand && name && pricePattern.test(price)) {
                products.push({brand, product_name: name, price});
            }
        }
        return products;
    }\\"\\"\\"
    products_data = page.evaluate(js_code, request.max_results)

    for pd in products_data:
        p = ProductResult()
        p.brand = pd.get("brand", "")
        p.product_name = pd.get("product_name", "")
        p.price = pd.get("price", "")
        result.products.append(p)

    for i, p in enumerate(result.products, 1):
        print(f"\\n  Product {i}:")
        print(f"    Brand:   {p.brand}")
        print(f"    Name:    {p.product_name}")
        print(f"    Price:   {p.price}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("ssense")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            request = SearchRequest()
            result = ssense_sneakers(page, request)
            print("\\n=== DONE ===")
            print(f"Found {len(result.products)} products")
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
    console.log(\`Navigating to \${CFG.categoryUrl}\`);
    await page.goto(CFG.categoryUrl, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(CFG.waits.page);

    const result = await stagehand.extract({
      instruction: \`Extract the first \${CFG.maxResults} product listings. For each get: brand name, product name, and price.\`,
      schema: {
        type: "object",
        properties: {
          products: {
            type: "array",
            items: {
              type: "object",
              properties: {
                brand: { type: "string" },
                product_name: { type: "string" },
                price: { type: "string" },
              },
            },
          },
        },
      },
    });

    console.log(\`\\nExtracted \${result.products?.length || 0} products\`);
    for (const p of result.products || []) {
      console.log(\`\\n  Brand: \${p.brand}\`);
      console.log(\`  Name:  \${p.product_name}\`);
      console.log(\`  Price: \${p.price}\`);
    }

    recorder.actions.push({ type: "extract", data: result });
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(__dirname, "ssense_sneakers.py"), pyCode);
    console.log("\\nSaved ssense_sneakers.py");
  } finally {
    await stagehand.close();
  }
})();
