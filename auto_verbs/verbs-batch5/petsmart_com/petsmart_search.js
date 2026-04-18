const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * petsmart.com – Product Search
 *
 * Searches PetSmart for products and extracts
 * product name, brand, price, rating, and review count.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  query: "dog food grain free",
  maxResults: 5,
  waits: { page: 8000 },
};

// ── Python Script Generator ──────────────────────────────────────────────────
function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
petsmart.com – Product Search
Query: "${cfg.query}"

Generated on: ${ts}
Recorded ${n} browser interactions

Uses Playwright's native locator API with the user's Chrome profile.
"""

import re
import os, sys, shutil
from dataclasses import dataclass
from urllib.parse import quote_plus
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class PetSmartRequest:
    query: str = "${cfg.query}"
    max_results: int = ${cfg.maxResults}


@dataclass(frozen=True)
class PetSmartProduct:
    product_name: str = ""
    brand: str = ""
    price: str = ""
    rating: str = ""
    num_reviews: str = ""


@dataclass(frozen=True)
class PetSmartResult:
    products: list = None  # list[PetSmartProduct]


def petsmart_search(page: Page, request: PetSmartRequest) -> PetSmartResult:
    """Search PetSmart for products."""
    print(f"  Query: {request.query}")
    print(f"  Max results: {request.max_results}\\n")

    # ── Navigate ──────────────────────────────────────────────────────
    url = f"https://www.petsmart.com/search/?q={quote_plus(request.query)}"
    print(f"Loading {url}...")
    checkpoint("Navigate to PetSmart search")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(${cfg.waits.page})

    # ── Extract products ──────────────────────────────────────────────
    products = page.evaluate(r"""(maxResults) => {
        const cards = document.querySelectorAll('[class*="sparky-c-product-card"]');
        const results = [];
        const seen = new Set();

        for (const card of cards) {
            if (results.length >= maxResults) break;

            // Product name from link
            const nameLink = card.querySelector('a[class*="sparky-c-text-link"]');
            const name = nameLink ? nameLink.innerText.trim() : '';
            if (!name || seen.has(name)) continue;
            seen.add(name);

            // Brand: extract from name (before ® or first word)
            let brand = '';
            const brandMatch = name.match(/^(.+?)[®™]/);
            if (brandMatch) {
                brand = brandMatch[1].trim();
            }

            // Price from aria-label on price container
            const priceEl = card.querySelector('[class*="sparky-c-price"][aria-label]');
            let price = '';
            if (priceEl) {
                const priceLabel = priceEl.getAttribute('aria-label') || '';
                const pm = priceLabel.match(/(\\$[\\d,.]+)/);
                if (pm) price = pm[1];
            }

            // Rating from star-rating icons aria-label
            const ratingEl = card.querySelector('[class*="star-rating__icons"]');
            let rating = '';
            if (ratingEl) {
                const ratingLabel = ratingEl.getAttribute('aria-label') || '';
                const rm = ratingLabel.match(/(\\d+\\.?\\d*)\\s+out of\\s+(\\d+)/);
                if (rm) rating = rm[1] + '/' + rm[2];
            }

            // Review count from rating-after aria-label
            const reviewEl = card.querySelector('[class*="star-rating__rating-after"]');
            let numReviews = '';
            if (reviewEl) {
                const rl = reviewEl.getAttribute('aria-label') || reviewEl.innerText;
                const rvm = rl.match(/(\\d[\\d,]*)/);
                if (rvm) numReviews = rvm[1];
            }

            results.push({ product_name: name, brand, price, rating, num_reviews: numReviews });
        }
        return results;
    }""", request.max_results)

    # ── Print results ─────────────────────────────────────────────────
    print("\\n" + "=" * 60)
    print(f"PetSmart Search: {request.query}")
    print("=" * 60)
    for idx, p in enumerate(products, 1):
        print(f"\\n  {idx}. {p['product_name']}")
        print(f"     Brand: {p['brand']} | Price: {p['price']}")
        print(f"     Rating: {p['rating']} | Reviews: {p['num_reviews']}")

    print(f"\\nFound {len(products)} products")
    return PetSmartResult(
        products=[PetSmartProduct(**p) for p in products]
    )


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("petsmart_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = petsmart_search(page, PetSmartRequest())
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
    const url = `https://www.petsmart.com/search/?q=${encodeURIComponent(CFG.query).replace(/%20/g, "+")}`;
    console.log(`\n🌐 Navigating to ${url}...`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url, description: "Navigate to PetSmart search" });

    const products = await page.evaluate((maxResults) => {
      const cards = document.querySelectorAll('[class*="sparky-c-product-card"]');
      const results = [];
      const seen = new Set();

      for (const card of cards) {
        if (results.length >= maxResults) break;

        const nameLink = card.querySelector('a[class*="sparky-c-text-link"]');
        const name = nameLink ? nameLink.innerText.trim() : "";
        if (!name || seen.has(name)) continue;
        seen.add(name);

        let brand = "";
        const brandMatch = name.match(/^(.+?)[®™]/);
        if (brandMatch) brand = brandMatch[1].trim();

        const priceEl = card.querySelector('[class*="sparky-c-price"][aria-label]');
        let price = "";
        if (priceEl) {
          const priceLabel = priceEl.getAttribute("aria-label") || "";
          const pm = priceLabel.match(/(\$[\d,.]+)/);
          if (pm) price = pm[1];
        }

        const ratingEl = card.querySelector('[class*="star-rating__icons"]');
        let rating = "";
        if (ratingEl) {
          const ratingLabel = ratingEl.getAttribute("aria-label") || "";
          const rm = ratingLabel.match(/(\d+\.?\d*)\s+out of\s+(\d+)/);
          if (rm) rating = rm[1] + "/" + rm[2];
        }

        const reviewEl = card.querySelector('[class*="star-rating__rating-after"]');
        let numReviews = "";
        if (reviewEl) {
          const rl = reviewEl.getAttribute("aria-label") || reviewEl.innerText;
          const rvm = rl.match(/(\d[\d,]*)/);
          if (rvm) numReviews = rvm[1];
        }

        results.push({ product_name: name, brand, price, rating, num_reviews: numReviews });
      }
      return results;
    }, CFG.maxResults);

    recorder.record("extract", {
      instruction: "Extract product results",
      description: `Extracted ${products.length} products`,
      results: products,
    });

    console.log("\n" + "=".repeat(60));
    console.log(`PetSmart Search: ${CFG.query}`);
    console.log("=".repeat(60));
    products.forEach((p, i) => {
      console.log(`\n   ${i + 1}. ${p.product_name}`);
      console.log(`      Brand: ${p.brand} | Price: ${p.price}`);
      console.log(`      Rating: ${p.rating} | Reviews: ${p.num_reviews}`);
    });

    const dir = path.join(__dirname);
    fs.writeFileSync(
      path.join(dir, "recorded_actions.json"),
      JSON.stringify(recorder.actions, null, 2)
    );
    console.log(`\n💾 Saved ${recorder.actions.length} actions`);

    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(dir, "petsmart_search.py"), pyCode);
    console.log("🐍 Saved Python script");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
