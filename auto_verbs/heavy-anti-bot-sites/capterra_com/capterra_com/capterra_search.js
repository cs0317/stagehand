const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Capterra – Search for software reviews
 */

const CFG = {
  searchQuery: "project management",
  maxResults: 5,
  waits: { page: 5000, action: 2000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Capterra – Search for software reviews

Generated on: ${ts}
Recorded ${n} browser interactions
"""

import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class CapterraSearchRequest:
    search_query: str = "${cfg.searchQuery}"
    max_results: int = ${cfg.maxResults}


@dataclass
class CapterraSoftwareItem:
    software_name: str = ""
    vendor: str = ""
    overall_rating: str = ""
    num_reviews: str = ""
    pricing: str = ""
    description: str = ""
    top_features: str = ""


@dataclass
class CapterraSearchResult:
    items: List[CapterraSoftwareItem] = field(default_factory=list)


# Search for software reviews on Capterra.
def capterra_search(page: Page, request: CapterraSearchRequest) -> CapterraSearchResult:
    """Search for software reviews on Capterra."""
    print(f"  Query: {request.search_query}")
    print(f"  Max results: {request.max_results}\\n")

    import urllib.parse
    encoded = urllib.parse.quote_plus(request.search_query)
    url = f"https://www.capterra.com/search/?query={encoded}"
    print(f"Loading {url}...")
    checkpoint("Navigate to Capterra search results")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    result = CapterraSearchResult()

    checkpoint("Extract software listings")
    js_code = """(max) => {
        const cards = document.querySelectorAll('[class*="listing"], [class*="product"], [class*="card"], [data-testid*="product"], article');
        const items = [];
        for (const card of cards) {
            if (items.length >= max) break;

            const nameEl = card.querySelector('h2, h3, h4, [class*="name"], [class*="title"] a, a[class*="product"]');
            const name = nameEl ? nameEl.textContent.trim() : '';
            if (!name) continue;

            const vendorEl = card.querySelector('[class*="vendor"], [class*="company"], [class*="by"]');
            const vendor = vendorEl ? vendorEl.textContent.trim().replace(/^by\\s*/i, '') : '';

            const ratingEl = card.querySelector('[class*="rating"], [class*="score"], [class*="overall"]');
            const rating = ratingEl ? ratingEl.textContent.trim() : '';

            const reviewEl = card.querySelector('[class*="review-count"], [class*="reviews"], [class*="ReviewCount"]');
            const numReviews = reviewEl ? reviewEl.textContent.trim().replace(/[()]/g, '') : '';

            const priceEl = card.querySelector('[class*="price"], [class*="pricing"]');
            const pricing = priceEl ? priceEl.textContent.trim() : '';

            const descEl = card.querySelector('[class*="desc"], [class*="description"], [class*="snippet"], p');
            const description = descEl ? descEl.textContent.trim() : '';

            const featEl = card.querySelector('[class*="feature"], [class*="highlight"]');
            const features = featEl ? featEl.textContent.trim() : '';

            items.push({
                software_name: name,
                vendor: vendor,
                overall_rating: rating,
                num_reviews: numReviews,
                pricing: pricing,
                description: description,
                top_features: features
            });
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = CapterraSoftwareItem()
        item.software_name = d.get("software_name", "")
        item.vendor = d.get("vendor", "")
        item.overall_rating = d.get("overall_rating", "")
        item.num_reviews = d.get("num_reviews", "")
        item.pricing = d.get("pricing", "")
        item.description = d.get("description", "")
        item.top_features = d.get("top_features", "")
        result.items.append(item)

    for i, item in enumerate(result.items, 1):
        print(f"\\n  Software {i}:")
        print(f"    Name:         {item.software_name}")
        print(f"    Vendor:       {item.vendor}")
        print(f"    Rating:       {item.overall_rating}")
        print(f"    Reviews:      {item.num_reviews}")
        print(f"    Pricing:      {item.pricing}")
        print(f"    Description:  {item.description[:80]}")
        print(f"    Features:     {item.top_features[:80]}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("capterra")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            request = CapterraSearchRequest()
            result = capterra_search(page, request)
            print("\\n=== DONE ===")
            print(f"Found {len(result.items)} software listings")
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
    const encoded = encodeURIComponent(CFG.searchQuery);
    const url = `https://www.capterra.com/search/?query=${encoded}`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    recorder.record("navigate", url, `Navigate to ${url}`);
    await page.waitForTimeout(CFG.waits.page);

    const data = await stagehand.extract(
      `Extract the top ${CFG.maxResults} software listings. For each get the software name, vendor, overall rating, number of reviews, pricing, description, and top features.`
    );
    recorder.record("extract", "software listings", JSON.stringify(data));
    console.log("Extracted:", JSON.stringify(data, null, 2));

    const outDir = __dirname;
    fs.writeFileSync(path.join(outDir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    fs.writeFileSync(path.join(outDir, "capterra_search.py"), genPython(CFG, recorder));
    console.log("Saved capterra_search.py");
  } finally {
    await stagehand.close();
  }
})();
