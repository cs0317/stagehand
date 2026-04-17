/**
 * Amazon – Today's Deals
 *
 * Prompt:
 *   Navigate to the "Today's Deals" page.
 *   Extract up to 5 deals with product name, deal price, original price,
 *   discount percentage, and deal type.
 *
 * Strategy:
 *   Direct URL: amazon.com/deals
 *   Then extract deal cards from the page text.
 */

const { Stagehand } = require("@browserbasehq/stagehand");
const { z } = require("zod");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { setupLLMClient, PlaywrightRecorder, observeAndAct } = require("../../stagehand-utils");

/* ── kill switch ─────────────────────────────────────────── */
const TIMEOUT = 150_000;
setTimeout(() => { console.error("\n⏰ Global timeout – exiting"); process.exit(1); }, TIMEOUT);

/* ── config ──────────────────────────────────────────────── */
const CFG = {
  url: "https://www.amazon.com/deals",
  maxItems: 5,
};

/* ── genPython (verb format) ─────────────────────────────── */
function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Amazon – Today's Deals
Extract up to ${cfg.maxItems} deals from Amazon's Today's Deals page.

Generated on: ${ts}
Recorded ${n} browser interactions
"""

import re
import os
from dataclasses import dataclass
from playwright.sync_api import sync_playwright, Page

import sys as _sys
import os as _os
_sys.path.insert(0, _os.path.join(_os.path.dirname(__file__), ".."))
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class AmazonDealsRequest:
    max_results: int = 5


@dataclass(frozen=True)
class AmazonDeal:
    product_name: str = ""
    deal_price: str = ""
    original_price: str = ""
    discount_percent: str = ""
    deal_type: str = ""


@dataclass(frozen=True)
class AmazonDealsResult:
    deals: list = None  # list[AmazonDeal]


# Navigate to Amazon's Today's Deals page and extract deal listings including
# product name, deal price, original price, discount percentage, and deal type.
def amazon_deals(page: Page, request: AmazonDealsRequest) -> AmazonDealsResult:
    max_results = request.max_results
    print(f"  Max deals to extract: {max_results}\\n")

    url = "https://www.amazon.com/deals"
    print(f"Loading {url}...")
    checkpoint(f"Navigate to {url}")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)
    print(f"  Loaded: {page.url}")

    results = []

    # Try structured extraction via deal cards
    # Amazon deal cards use data-testid or specific class patterns
    cards = page.locator('[data-testid="deal-card"], [class*="DealCard"], [class*="dealCard"]')
    count = cards.count()
    print(f"  Found {count} deal cards")

    if count > 0:
        for i in range(min(count, max_results)):
            card = cards.nth(i)
            try:
                card_text = card.inner_text(timeout=3000).strip()
                lines = [l.strip() for l in card_text.split("\\n") if l.strip()]

                product_name = "N/A"
                deal_price = "N/A"
                original_price = "N/A"
                discount_percent = "N/A"
                deal_type = "N/A"

                for line in lines:
                    # Discount percentage
                    dm = re.search(r'(\\d+)%\\s*off', line, re.I)
                    if dm:
                        discount_percent = f"{dm.group(1)}% off"
                        continue
                    # Price
                    pm = re.search(r'\\$[\\d,.]+', line)
                    if pm:
                        if deal_price == "N/A":
                            deal_price = pm.group(0)
                        elif original_price == "N/A":
                            original_price = pm.group(0)
                        continue
                    # Deal type
                    if any(kw in line.lower() for kw in ['lightning', 'deal of the day', 'best deal', 'limited time']):
                        deal_type = line
                        continue
                    # Product name (longest remaining line)
                    if len(line) > len(product_name) and len(line) > 10:
                        product_name = line

                if product_name != "N/A":
                    results.append(AmazonDeal(
                        product_name=product_name,
                        deal_price=deal_price,
                        original_price=original_price,
                        discount_percent=discount_percent,
                        deal_type=deal_type,
                    ))
            except Exception:
                continue
    
    # Fallback: text-based extraction
    if not results:
        print("  Card extraction failed, trying text-based extraction...")
        text = page.evaluate("document.body ? document.body.innerText : ''") or ""
        text_lines = [l.strip() for l in text.split("\\n") if l.strip()]

        i = 0
        while i < len(text_lines) and len(results) < max_results:
            line = text_lines[i]
            dm = re.search(r'(\\d+)%\\s*off', line, re.I)
            if dm:
                discount_percent = f"{dm.group(1)}% off"
                # Look around for price and product name
                deal_price = "N/A"
                original_price = "N/A"
                product_name = "N/A"
                deal_type = "N/A"

                # Search nearby lines (within 5 lines)
                for j in range(max(0, i - 3), min(len(text_lines), i + 5)):
                    nearby = text_lines[j]
                    pm = re.search(r'\\$[\\d,.]+', nearby)
                    if pm:
                        if deal_price == "N/A":
                            deal_price = pm.group(0)
                        elif original_price == "N/A":
                            original_price = pm.group(0)
                    if any(kw in nearby.lower() for kw in ['lightning', 'deal of the day', 'best deal', 'limited time']):
                        deal_type = nearby
                    if len(nearby) > 20 and not re.match(r'^[\\$\\d%]', nearby) and len(nearby) > len(product_name):
                        product_name = nearby

                if product_name != "N/A" or deal_price != "N/A":
                    results.append(AmazonDeal(
                        product_name=product_name,
                        deal_price=deal_price,
                        original_price=original_price,
                        discount_percent=discount_percent,
                        deal_type=deal_type,
                    ))
            i += 1

    print("=" * 60)
    print("Amazon - Today's Deals")
    print("=" * 60)
    for idx, d in enumerate(results, 1):
        print(f"\\n{idx}. {d.product_name}")
        print(f"   Price: {d.deal_price}  (was {d.original_price})")
        print(f"   Discount: {d.discount_percent}")
        print(f"   Type: {d.deal_type}")

    print(f"\\nFound {len(results)} deals")

    return AmazonDealsResult(deals=results)


def test_func():
    import subprocess, time
    subprocess.call("taskkill /f /im chrome.exe", stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(2)
    chrome_user_data = os.path.join(
        os.environ["USERPROFILE"], "AppData", "Local", "Google", "Chrome", "User Data", "Default"
    )
    with sync_playwright() as pw:
        context = pw.chromium.launch_persistent_context(
            chrome_user_data,
            channel="chrome",
            headless=False,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--disable-infobars",
                "--disable-extensions",
            ],
        )
        page = context.pages[0] if context.pages else context.new_page()
        result = amazon_deals(page, AmazonDealsRequest())
        print(f"\\nReturned {len(result.deals or [])} deals")
        context.close()


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
`;
}

/* ── main ────────────────────────────────────────────────── */
(async () => {
  const stagehand = new Stagehand({
    env: "LOCAL",
    verbose: 1,
    localBrowserLaunchOptions: {
      headless: false,
      channel: "chrome",
      args: ["--disable-blink-features=AutomationControlled"],
    },
  });
  await stagehand.init();

  const page = stagehand.context.pages()[0];
  const recorder = new PlaywrightRecorder();

  try {
    // ── Navigate to Today's Deals ────────────────────────────────────
    console.log("🌐 Navigating to Amazon Today's Deals...");
    recorder.record("navigate", { url: CFG.url });
    await page.goto(CFG.url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(5000);
    console.log(`   ✅ Loaded: ${page.url()}`);

    // ── Check for bot detection ──────────────────────────────────────
    const bodyText = await page.evaluate(() => document.body?.innerText || "");
    if (bodyText.includes("Enter the characters you see below") ||
        bodyText.includes("CAPTCHA") ||
        bodyText.includes("automated access")) {
      console.log("🚫 Bot detection triggered. Amazon uses heavy anti-bot measures.");
      console.log("   Stopping as instructed — this site is not suitable for agent operation.");
      process.exit(1);
    }

    // ── Extract deals ────────────────────────────────────────────────
    console.log(`🎯 Extracting up to ${CFG.maxItems} deals...`);

    const deals = await stagehand.extract(
      `Extract the first ${CFG.maxItems} deals visible on this Amazon Today's Deals page. For each deal get: product name, deal price, original price, discount percentage, and deal type (Lightning Deal, Deal of the Day, etc.)`,
      z.object({
        deals: z.array(z.object({
          product_name: z.string(),
          deal_price: z.string(),
          original_price: z.string(),
          discount_percent: z.string(),
          deal_type: z.string(),
        })),
      })
    );

    console.log(`\n✅ Extracted ${deals.deals.length} deals:`);
    deals.deals.forEach((d, i) => {
      console.log(`  ${i + 1}. ${d.product_name}`);
      console.log(`     Price: ${d.deal_price}  (was ${d.original_price})`);
      console.log(`     Discount: ${d.discount_percent}`);
      console.log(`     Type: ${d.deal_type}`);
    });

    // ── Generate Python ──────────────────────────────────────────────
    const pyCode = genPython(CFG, recorder);
    const pyPath = path.join(__dirname, "amazon_deals.py");
    fs.writeFileSync(pyPath, pyCode, "utf-8");
    console.log(`\n📄 Python script written to: ${pyPath}`);

    // ── Save recorded actions ────────────────────────────────────────
    const actionsPath = path.join(__dirname, "recorded_actions.json");
    fs.writeFileSync(actionsPath, JSON.stringify(recorder.actions, null, 2), "utf-8");
    console.log(`📋 Recorded actions: ${actionsPath}`);

  } catch (err) {
    console.error("❌ Error:", err.message);
  } finally {
    await stagehand.close();
  }
})();
