const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Amazon – Coupons Page
 *
 * Browses amazon.com/coupons and extracts coupon deals with
 * product name, discount, price, and category.
 */

const CFG = {
  maxResults: 5,
  waits: { page: 6000, action: 2000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Amazon – Coupons Page

Generated on: ${ts}
Recorded ${n} browser interactions
"""

import re
import os, sys, shutil
from dataclasses import dataclass
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class CouponRequest:
    max_results: int = ${cfg.maxResults}


@dataclass
class CouponResult:
    product_name: str = ""
    discount: str = ""
    price: str = ""
    category: str = ""


def amazon_coupons(page: Page, request: CouponRequest) -> list:
    """Extract coupon deals from Amazon coupons page."""
    print(f"  Max results: {request.max_results}\\n")

    # ── Navigate to Amazon coupons ────────────────────────────────────
    url = "https://www.amazon.com/coupons"
    print(f"Loading {url}...")
    checkpoint("Navigate to Amazon coupons")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(6000)

    # ── Extract coupon cards ──────────────────────────────────────────
    checkpoint("Extract coupon deals")
    results = []

    cards = page.locator('[data-testid="product-card"]').all()

    for card in cards[:request.max_results]:
        try:
            coupon = CouponResult()

            # Discount badge: "Save 10%" or "Save $420"
            try:
                badge = card.locator('[class*="CouponExperienceBadge"] span').first
                if badge.is_visible(timeout=1000):
                    coupon.discount = badge.inner_text().strip()
            except Exception:
                pass

            # Price
            try:
                price_el = card.locator('span.a-price span.a-offscreen').first
                if price_el.count() > 0:
                    coupon.price = price_el.inner_text().strip()
                else:
                    price_el = card.locator('span.a-price').first
                    if price_el.is_visible(timeout=1000):
                        coupon.price = price_el.inner_text().strip().replace("\\n", "")
            except Exception:
                pass

            # Product name from link
            try:
                link = card.locator('[data-testid="product-card-link"]').first
                if link.is_visible(timeout=1000):
                    coupon.product_name = link.inner_text().strip()
            except Exception:
                pass

            # Category (from the page filter or breadcrumb - not always per-card)
            coupon.category = "Coupons"

            if coupon.product_name or coupon.discount:
                results.append(coupon)
        except Exception:
            pass

    # ── Print results ─────────────────────────────────────────────────
    print("\\n" + "=" * 70)
    print("Amazon Coupon Deals")
    print("=" * 70)
    for i, c in enumerate(results, 1):
        print(f"  {i}. {c.product_name[:60]}")
        print(f"     Discount: {c.discount}")
        print(f"     Price:    {c.price}")
        print(f"     Category: {c.category}")
        print()

    return results


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("amazon_coupons")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            results = amazon_coupons(page, CouponRequest())
            print(f"\\nDone. Found {len(results)} coupons.")
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
    console.log("\\n🌐 Navigating to Amazon coupons...");
    await page.goto("https://www.amazon.com/coupons", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url: "https://www.amazon.com/coupons", description: "Navigate to Amazon coupons" });

    console.log(`\\n🔍 Extracting up to ${CFG.maxResults} coupons...`);
    const coupons = await stagehand.extract(
      `Extract up to ${CFG.maxResults} coupon deals. For each, get: product name, discount amount/percentage, price, and category.`
    );
    console.log("\\n📊 Coupons:", JSON.stringify(coupons, null, 2));
    recorder.record("extract", { instruction: "Extract coupons", description: "Extracted coupon deals", results: coupons });

    const dir = __dirname;
    fs.writeFileSync(path.join(dir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(dir, "amazon_coupons.py"), pyCode);
    console.log("🐍 Saved amazon_coupons.py");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
