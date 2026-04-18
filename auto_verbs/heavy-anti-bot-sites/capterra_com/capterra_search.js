const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient, observeAndAct } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * capterra.com – Software Category Search
 *
 * Browses a capterra.com software category page,
 * extracts product cards with name, rating, reviews, feature, description.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  url: "https://www.capterra.com",
  categorySlug: "project-management-software",
  maxResults: 5,
  waits: { page: 8000 },
};

// ── Python Script Generator ──────────────────────────────────────────────────
function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
capterra.com – Software Category Search
Category: ${cfg.categorySlug}

Generated on: ${ts}
Recorded ${n} browser interactions

Uses Playwright's native locator API with the user's Chrome profile.
"""

import re
import os, sys, shutil
from dataclasses import dataclass
from playwright.sync_api import Playwright, sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class CapterraSearchRequest:
    category_slug: str = "${cfg.categorySlug}"
    max_results: int = ${cfg.maxResults}


@dataclass(frozen=True)
class CapterraProduct:
    product_name: str = ""
    rating: str = ""
    num_reviews: str = ""
    key_feature: str = ""
    description: str = ""


@dataclass(frozen=True)
class CapterraSearchResult:
    products: list = None  # list[CapterraProduct]


def capterra_search(page: Page, request: CapterraSearchRequest) -> CapterraSearchResult:
    """Search capterra.com for software products in a category."""
    category_slug = request.category_slug
    max_results = request.max_results
    print(f"  Category: {category_slug}")
    print(f"  Max results: {max_results}\\n")

    # ── Navigate to category page ─────────────────────────────────────
    url = f"https://www.capterra.com/{category_slug}/"
    print(f"Loading {url}...")
    checkpoint("Navigate to Capterra category page")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(8000)
    print(f"  Loaded: {page.url}")

    # ── Extract products from product cards ───────────────────────────
    checkpoint("Extract products from product cards")
    results_data = page.evaluate(r"""(maxResults) => {
        const cards = document.querySelectorAll('[data-testid^="product-card-container-"]');
        const results = [];
        for (const card of cards) {
            if (results.length >= maxResults) break;
            const text = card.innerText || '';
            const lines = text.split('\\n').map(l => l.trim()).filter(l => l);

            // Name: first line
            const productName = lines[0] || '';

            // Rating & reviews: pattern like "4.6 (5732)"
            let rating = 'N/A';
            let numReviews = 'N/A';
            for (const line of lines) {
                const m = line.match(/^(\\d+\\.\\d+)\\s*\\((\\d+)\\)/);
                if (m) {
                    rating = m[1];
                    numReviews = m[2];
                    break;
                }
            }

            // Key feature: after "Great for:"/"Good for:" or "features reviewers most value"
            let keyFeature = 'N/A';
            for (let j = 0; j < lines.length; j++) {
                if (/^(Great|Good) for:$/.test(lines[j]) && j + 1 < lines.length) {
                    keyFeature = lines[j + 1];
                    break;
                }
                if (/features reviewers most value/i.test(lines[j]) && j + 1 < lines.length) {
                    keyFeature = lines[j + 1];
                    break;
                }
            }

            // Description: longest line > 50 chars that contains "Learn more"
            let description = 'N/A';
            for (const line of lines) {
                if (line.length > 50 && line.includes('Learn more')) {
                    description = line.replace(/\\s*Learn more about .+$/, '').trim();
                    break;
                }
            }

            if (productName && rating !== 'N/A') {
                results.push({ productName, rating, numReviews, keyFeature, description });
            }
        }
        return results;
    }""", max_results)

    products = []
    for r in results_data:
        products.append(CapterraProduct(
            product_name=r.get("productName", ""),
            rating=r.get("rating", "N/A"),
            num_reviews=r.get("numReviews", "N/A"),
            key_feature=r.get("keyFeature", "N/A"),
            description=r.get("description", "N/A"),
        ))

    # ── Print results ─────────────────────────────────────────────────
    print("=" * 60)
    print(f'capterra.com - "{category_slug}" Software')
    print("=" * 60)
    for idx, p in enumerate(products, 1):
        print(f"\\n{idx}. {p.product_name}")
        print(f"   Rating: {p.rating} ({p.num_reviews} reviews)")
        print(f"   Key Feature: {p.key_feature}")
        print(f"   Description: {p.description[:120]}")

    print(f"\\nFound {len(products)} products")
    return CapterraSearchResult(products=products)


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("capterra_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = capterra_search(page, CapterraSearchRequest())
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
      args: [
        "--disable-blink-features=AutomationControlled",
        "--start-maximized",
      ],
    },
  });
  await stagehand.init();
  const page = stagehand.context.pages()[0];
  const recorder = new PlaywrightRecorder();

  try {
    // ── Navigate to Capterra category page ─────────────────────────
    const url = `${CFG.url}/${CFG.categorySlug}/`;
    console.log(`\n🌐 Navigating to ${url}...`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url, description: `Browse Capterra "${CFG.categorySlug}"` });
    console.log(`   Loaded: ${page.url()}`);

    // ── Extract products ───────────────────────────────────────────
    console.log(`\n🎯 Extracting up to ${CFG.maxResults} products...\n`);

    const results = await page.evaluate((maxResults) => {
      const cards = document.querySelectorAll('[data-testid^="product-card-container-"]');
      const items = [];
      for (const card of cards) {
        if (items.length >= maxResults) break;
        const text = card.innerText || "";
        const lines = text.split("\n").map(l => l.trim()).filter(l => l);

        const productName = lines[0] || "";
        let rating = "N/A", numReviews = "N/A";
        for (const line of lines) {
          const m = line.match(/^(\d+\.\d+)\s*\((\d+)\)/);
          if (m) { rating = m[1]; numReviews = m[2]; break; }
        }

        let keyFeature = "N/A";
        for (let j = 0; j < lines.length; j++) {
          if (/^(Great|Good) for:$/.test(lines[j]) && j + 1 < lines.length) {
            keyFeature = lines[j + 1]; break;
          }
          if (/features reviewers most value/i.test(lines[j]) && j + 1 < lines.length) {
            keyFeature = lines[j + 1]; break;
          }
        }

        let description = "N/A";
        for (const line of lines) {
          if (line.length > 50 && line.includes("Learn more")) {
            description = line.replace(/\s*Learn more about .+$/, "").trim(); break;
          }
        }

        if (productName && rating !== "N/A") {
          items.push({ productName, rating, numReviews, keyFeature, description });
        }
      }
      return items;
    }, CFG.maxResults);

    recorder.record("extract", {
      instruction: "Extract products from product cards",
      description: `Extracted ${results.length} products`,
      results,
    });

    console.log(`📋 Found ${results.length} products:\n`);
    results.forEach((r, i) => {
      console.log(`   ${i + 1}. ${r.productName}`);
      console.log(`      Rating: ${r.rating} (${r.numReviews} reviews) | Feature: ${r.keyFeature}`);
      console.log(`      ${r.description.substring(0, 80)}...`);
    });

    // ── Save outputs ───────────────────────────────────────────────
    const dir = path.join(__dirname);

    const actionsFile = path.join(dir, "recorded_actions.json");
    fs.writeFileSync(actionsFile, JSON.stringify(recorder.actions, null, 2));
    console.log(`\n💾 Saved ${recorder.actions.length} actions → ${actionsFile}`);

    const pyFile = path.join(dir, "capterra_search.py");
    fs.writeFileSync(pyFile, genPython(CFG, recorder));
    console.log(`🐍 Saved Python script → ${pyFile}`);

  } catch (err) {
    console.error("❌ Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
