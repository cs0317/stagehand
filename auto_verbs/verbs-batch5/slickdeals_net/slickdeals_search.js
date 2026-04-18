const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Slickdeals – Search Deals
 *
 * Searches slickdeals.net for deals on a product and extracts
 * deal title, price, original price, store name, and thumbs up.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  query: "headphones",
  maxDeals: 5,
  waits: { page: 5000 },
};

// ── Python Script Generator ──────────────────────────────────────────────────
function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Slickdeals – Search Deals
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
class SlickdealsRequest:
    query: str = "${cfg.query}"
    max_deals: int = ${cfg.maxDeals}


@dataclass
class Deal:
    title: str = ""
    price: str = ""
    original_price: str = ""
    store: str = ""
    thumbs_up: str = ""


@dataclass
class SlickdealsResult:
    deals: list = field(default_factory=list)


def slickdeals_search(page: Page, request: SlickdealsRequest) -> SlickdealsResult:
    """Search slickdeals.net for deals."""
    print(f"  Query: {request.query}\\n")

    # ── Search ────────────────────────────────────────────────────────
    search_url = f"https://slickdeals.net/newsearch.php?q={quote_plus(request.query)}&searcharea=deals&searchin=first"
    print(f"Loading {search_url}...")
    checkpoint("Navigate to slickdeals search")
    page.goto(search_url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    # ── Extract deals ─────────────────────────────────────────────────
    raw_deals = page.evaluate(r"""(maxDeals) => {
        const cards = document.querySelectorAll('div.dealCardListView');
        const results = [];
        for (let i = 0; i < Math.min(cards.length, maxDeals); i++) {
            const card = cards[i];
            const titleEl = card.querySelector('a[class*="dealCardListView__title"]');
            const priceEl = card.querySelector('span.dealCardListView__finalPrice');
            const listPriceEl = card.querySelector('span.dealCardListView__listPrice');
            const storeEl = card.querySelector('div.dealCardListView__store');
            const voteEl = card.querySelector('span.dealCardListView__voteCount');

            results.push({
                title: titleEl ? titleEl.innerText.trim() : '',
                price: priceEl ? priceEl.innerText.trim() : '',
                original_price: listPriceEl ? listPriceEl.innerText.trim() : '',
                store: storeEl ? storeEl.innerText.trim() : '',
                thumbs_up: voteEl ? voteEl.innerText.trim() : '0',
            });
        }
        return results;
    }""", request.max_deals)

    # ── Print results ─────────────────────────────────────────────────
    print("\\n" + "=" * 60)
    print(f"Slickdeals: {request.query}")
    print("=" * 60)
    for idx, d in enumerate(raw_deals, 1):
        print(f"\\n  {idx}. {d['title']}")
        print(f"     Price: {d['price']}")
        if d['original_price']:
            print(f"     Was: {d['original_price']}")
        print(f"     Store: {d['store']}")
        print(f"     Thumbs up: {d['thumbs_up']}")

    deals = [Deal(**d) for d in raw_deals]
    return SlickdealsResult(deals=deals)


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("slickdeals_net")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = slickdeals_search(page, SlickdealsRequest())
            print(f"\\nReturned {len(result.deals)} deals")
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
    const searchUrl = `https://slickdeals.net/newsearch.php?q=${encodeURIComponent(CFG.query)}&searcharea=deals&searchin=first`;
    console.log(`\n🌐 Searching: ${searchUrl}...`);
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url: searchUrl, description: "Search slickdeals" });

    const deals = await page.evaluate((maxDeals) => {
      const cards = document.querySelectorAll("div.dealCardListView");
      const results = [];
      for (let i = 0; i < Math.min(cards.length, maxDeals); i++) {
        const card = cards[i];
        const titleEl = card.querySelector('a[class*="dealCardListView__title"]');
        const priceEl = card.querySelector("span.dealCardListView__finalPrice");
        const listPriceEl = card.querySelector("span.dealCardListView__listPrice");
        const storeEl = card.querySelector("div.dealCardListView__store");
        const voteEl = card.querySelector("span.dealCardListView__voteCount");

        results.push({
          title: titleEl ? titleEl.innerText.trim() : "",
          price: priceEl ? priceEl.innerText.trim() : "",
          original_price: listPriceEl ? listPriceEl.innerText.trim() : "",
          store: storeEl ? storeEl.innerText.trim() : "",
          thumbs_up: voteEl ? voteEl.innerText.trim() : "0",
        });
      }
      return results;
    }, CFG.maxDeals);

    recorder.record("extract", {
      instruction: "Extract deal cards",
      description: `Extracted ${deals.length} deals`,
      results: deals,
    });

    console.log("\n" + "=".repeat(60));
    console.log(`Slickdeals: ${CFG.query}`);
    console.log("=".repeat(60));
    deals.forEach((d, i) => {
      console.log(`\n  ${i + 1}. ${d.title}`);
      console.log(`     Price: ${d.price}`);
      if (d.original_price) console.log(`     Was: ${d.original_price}`);
      console.log(`     Store: ${d.store}`);
      console.log(`     Thumbs up: ${d.thumbs_up}`);
    });

    const dir = path.join(__dirname);
    fs.writeFileSync(
      path.join(dir, "recorded_actions.json"),
      JSON.stringify(recorder.actions, null, 2)
    );
    console.log(`\n💾 Saved ${recorder.actions.length} actions`);

    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(dir, "slickdeals_search.py"), pyCode);
    console.log("🐍 Saved Python script");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
