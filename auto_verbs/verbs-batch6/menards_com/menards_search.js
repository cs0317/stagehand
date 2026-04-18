const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  query: "cordless drill",
  maxResults: 5,
  waits: { page: 5000, action: 2000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Menards – Product Search
Query: "${cfg.query}"

Generated on: ${ts}
Recorded ${n} browser interactions
"""

import re
import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
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
    price: str = ""
    rating: str = ""
    url: str = ""


@dataclass
class ProductResult:
    products: List[Product] = field(default_factory=list)


def menards_search(page: Page, request: ProductRequest) -> ProductResult:
    """Search Menards for products."""
    print(f"  Query: {request.query}\\n")

    url = f"https://www.menards.com/main/search.html?search={request.query.replace(' ', '+')}"
    print(f"Loading {url}...")
    checkpoint("Navigate to Menards search")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    checkpoint("Extract product listings")
    products = []
    body_text = page.evaluate("document.body.innerText") or ""

    cards = page.locator("[class*='product-card'], [class*='ProductCard'], [data-testid*='product']").all()
    for card in cards[:request.max_results]:
        try:
            text = card.inner_text().strip()
            lines = [l.strip() for l in text.split("\\n") if l.strip()]
            name = lines[0] if lines else ""
            brand = ""
            price = ""
            rating = ""
            for line in lines:
                pm = re.search(r"\\$([\\d,.]+)", line)
                if pm:
                    price = "$" + pm.group(1)
                rm = re.search(r"(\\d+\\.?\\d*)\\s*(?:star|out of|/5)", line, re.IGNORECASE)
                if rm:
                    rating = rm.group(1)
            if name and len(name) > 3:
                products.append(Product(name=name[:100], brand=brand, price=price, rating=rating))
        except Exception:
            pass

    if not products:
        lines = [l.strip() for l in body_text.split("\\n") if l.strip()]
        for line in lines:
            if "drill" in line.lower() and len(line) > 10:
                products.append(Product(name=line[:100]))
                if len(products) >= request.max_results:
                    break

    result = ProductResult(products=products[:request.max_results])

    print("\\n" + "=" * 60)
    print(f"Menards: {request.query}")
    print("=" * 60)
    for i, p in enumerate(result.products, 1):
        print(f"  {i}. {p.name}")
        if p.brand:
            print(f"     Brand: {p.brand}")
        if p.price:
            print(f"     Price: {p.price}")
        if p.rating:
            print(f"     Rating: {p.rating}")
    print(f"\\nTotal: {len(result.products)} products")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("menards_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = menards_search(page, ProductRequest())
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
    const searchUrl = `https://www.menards.com/main/search.html?search=${CFG.query.replace(/ /g, '+')}`;
    console.log(`\n🌐 Loading: ${searchUrl}...`);
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url: searchUrl, description: "Navigate to Menards search" });

    const products = await stagehand.extract(
      `extract up to ${CFG.maxResults} products with product name, brand, price, rating, and product URL`
    );
    console.log("\n📊 Products:", JSON.stringify(products, null, 2));
    recorder.record("extract", { instruction: "Extract products", results: products });

    const dir = path.join(__dirname);
    fs.writeFileSync(path.join(dir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    console.log(`\n💾 Saved ${recorder.actions.length} actions`);

    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(dir, "menards_search.py"), pyCode);
    console.log("🐍 Saved Python script");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
