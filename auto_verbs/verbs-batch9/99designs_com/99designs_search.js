const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * 99designs – Browse design contest entries / find designers
 */

const CFG = {
  category: "website design",
  maxResults: 5,
  waits: { page: 5000, action: 2000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
99designs – Designer / contest search

Generated on: ${ts}
Recorded ${n} browser interactions
"""

import os, sys, shutil, re
from dataclasses import dataclass, field
from typing import List
from urllib.parse import quote_plus
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class DesignSearchRequest:
    category: str = "${cfg.category}"
    max_results: int = ${cfg.maxResults}


@dataclass
class DesignerItem:
    designer_name: str = ""
    design_style: str = ""
    rating: str = ""
    contests_won: str = ""
    price_range: str = ""


@dataclass
class DesignSearchResult:
    category: str = ""
    items: List[DesignerItem] = field(default_factory=list)


# Searches 99designs for designers in a given design category and extracts
# designer name, style, rating, contests won, and price range.
def search_99designs(page: Page, request: DesignSearchRequest) -> DesignSearchResult:
    """Search 99designs for designers by category."""
    print(f"  Category: {request.category}\\n")

    encoded = quote_plus(request.category)
    url = f"https://99designs.com/designers/search?categories={encoded}"
    print(f"Loading {url}...")
    checkpoint("Navigate to 99designs designer search")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    # Dismiss cookie banner if present
    for sel in ['button:has-text("Accept")', 'button:has-text("Got it")', '[aria-label="Close"]']:
        try:
            btn = page.locator(sel).first
            if btn.is_visible(timeout=2000):
                btn.evaluate("el => el.click()")
                page.wait_for_timeout(500)
        except Exception:
            pass

    result = DesignSearchResult(category=request.category)

    checkpoint("Extract designer listings")
    js_code = """(max) => {
        const items = [];
        // Try profile cards
        const cards = document.querySelectorAll('[data-testid="designer-card"], .designer-card, .profile-card, article, [class*="DesignerCard"], [class*="designer-tile"]');
        for (const card of cards) {
            if (items.length >= max) break;
            const text = (card.textContent || '').replace(/\\s+/g, ' ').trim();
            if (text.length < 10) continue;

            let name = '';
            const nameEl = card.querySelector('h2, h3, h4, [class*="name"], [class*="Name"], a[class*="designer"]');
            if (nameEl) name = nameEl.textContent.trim();

            let style = '';
            const styleEl = card.querySelector('[class*="style"], [class*="specialty"], [class*="tag"]');
            if (styleEl) style = styleEl.textContent.trim();

            let rating = '';
            const ratingMatch = text.match(/(\\d\\.\\d)\\s*(?:\\/|out of|stars?)/i) || text.match(/(\\d\\.\\d)/);
            if (ratingMatch && parseFloat(ratingMatch[1]) <= 5.0) rating = ratingMatch[1];

            let contestsWon = '';
            const wonMatch = text.match(/(\\d+)\\s*(?:contest|win|won)/i);
            if (wonMatch) contestsWon = wonMatch[1];

            let priceRange = '';
            const priceMatch = text.match(/(\\$[\\d,]+\\s*[-–]\\s*\\$[\\d,]+|starting\\s*(?:at|from)\\s*\\$[\\d,]+)/i);
            if (priceMatch) priceRange = priceMatch[1];

            if (name) {
                items.push({designer_name: name, design_style: style, rating, contests_won: contestsWon, price_range: priceRange});
            }
        }
        // Fallback: search result items
        if (items.length === 0) {
            const links = document.querySelectorAll('a[href*="/designer"]');
            for (const link of links) {
                if (items.length >= max) break;
                const name = link.textContent.trim();
                if (name && name.length > 2 && name.length < 80) {
                    items.push({designer_name: name, design_style: '', rating: '', contests_won: '', price_range: ''});
                }
            }
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = DesignerItem()
        item.designer_name = d.get("designer_name", "")
        item.design_style = d.get("design_style", "")
        item.rating = d.get("rating", "")
        item.contests_won = d.get("contests_won", "")
        item.price_range = d.get("price_range", "")
        result.items.append(item)

    print(f"\\nFound {len(result.items)} designers for '{request.category}':")
    for i, item in enumerate(result.items, 1):
        print(f"\\n  {i}. {item.designer_name}")
        print(f"     Style:        {item.design_style}")
        print(f"     Rating:       {item.rating}")
        print(f"     Contests Won: {item.contests_won}")
        print(f"     Price Range:  {item.price_range}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("99designs")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            request = DesignSearchRequest()
            result = search_99designs(page, request)
            print("\\n=== DONE ===")
            print(f"Found {len(result.items)} designers")
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
  const recorder = new PlaywrightRecorder();
  const page = stagehand.page;

  try {
    const encoded = encodeURIComponent(CFG.category);
    const url = `https://99designs.com/designers/search?categories=${encoded}`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    recorder.goto(url);
    await page.waitForTimeout(CFG.waits.page);

    const data = await stagehand.extract(
      `Extract the first ${CFG.maxResults} designers. For each get the designer name, design style/specialty, rating, number of contests won, and price range.`
    );
    recorder.record("extract", { description: "designers", results: data });
    console.log("Extracted:", JSON.stringify(data, null, 2));

    const outDir = __dirname;
    fs.writeFileSync(path.join(outDir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    fs.writeFileSync(path.join(outDir, "99designs_search.py"), genPython(CFG, recorder));
    console.log("Saved 99designs_search.py");
  } finally {
    await stagehand.close();
  }
})();
