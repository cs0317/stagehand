const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Wine Enthusiast – Wine Reviews
 *
 * Searches winemag.com for wine reviews and extracts
 * wine name, winery, vintage, rating, price, and tasting notes.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  query: "Pinot Noir Oregon",
  maxWines: 5,
  waits: { page: 8000 },
};

// ── Python Script Generator ──────────────────────────────────────────────────
function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Wine Enthusiast – Wine Reviews
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
class WineRequest:
    query: str = "${cfg.query}"
    max_wines: int = ${cfg.maxWines}


@dataclass
class WineReview:
    wine_name: str = ""
    winery: str = ""
    vintage: str = ""
    rating: str = ""
    price: str = ""
    tasting_notes: str = ""


@dataclass
class WineResult:
    wines: list = field(default_factory=list)


def wine_search(page: Page, request: WineRequest) -> WineResult:
    """Search Wine Enthusiast for wine reviews."""
    print(f"  Query: {request.query}\\n")

    # ── Search ────────────────────────────────────────────────────────
    search_url = f"https://www.winemag.com/?s={quote_plus(request.query)}&search_type=ratings"
    print(f"Loading {search_url}...")
    checkpoint("Navigate to Wine Enthusiast search")
    page.goto(search_url, wait_until="domcontentloaded")
    page.wait_for_timeout(8000)

    # ── Extract wines ─────────────────────────────────────────────────
    raw_wines = page.evaluate(r"""(maxWines) => {
        const text = document.body.innerText;
        // Pattern: WineName YYYY Variety(Region) / NN Points | Price / Tasting notes / See Full Review
        const pattern = /(.+?\\s(\\d{4})\\s.+?)\\n(\\d+)\\sPoints\\s\\|\\s(\\$[\\d.]+).*?\\n(.+?)\\nSee Full Review/g;
        const results = [];
        let m;
        while ((m = pattern.exec(text)) && results.length < maxWines) {
            const fullName = m[1].trim();
            const vintage = m[2];
            // Winery = text before vintage year
            const winery = fullName.substring(0, fullName.indexOf(vintage)).trim();
            results.push({
                wine_name: fullName,
                winery: winery,
                vintage: vintage,
                rating: m[3] + ' Points',
                price: m[4],
                tasting_notes: m[5].trim(),
            });
        }
        return results;
    }""", request.max_wines)

    # ── Print results ─────────────────────────────────────────────────
    print("\\n" + "=" * 60)
    print(f"Wine Enthusiast: {request.query}")
    print("=" * 60)
    for idx, w in enumerate(raw_wines, 1):
        print(f"\\n  {idx}. {w['wine_name']}")
        print(f"     Winery: {w['winery']}")
        print(f"     Vintage: {w['vintage']}")
        print(f"     Rating: {w['rating']}")
        print(f"     Price: {w['price']}")
        print(f"     Notes: {w['tasting_notes'][:100]}...")

    wines = [WineReview(**w) for w in raw_wines]
    return WineResult(wines=wines)


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("wineenthusiast_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = wine_search(page, WineRequest())
            print(f"\\nReturned {len(result.wines)} wines")
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
    const searchUrl = `https://www.winemag.com/?s=${encodeURIComponent(CFG.query)}&search_type=ratings`;
    console.log(`\n🌐 Searching: ${searchUrl}...`);
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url: searchUrl, description: "Search Wine Enthusiast" });

    const wines = await page.evaluate((maxWines) => {
      const text = document.body.innerText;
      const pattern = /(.+?\s(\d{4})\s.+?)\n(\d+)\sPoints\s\|\s(\$[\d.]+).*?\n(.+?)\nSee Full Review/g;
      const results = [];
      let m;
      while ((m = pattern.exec(text)) && results.length < maxWines) {
        const fullName = m[1].trim();
        const vintage = m[2];
        const winery = fullName.substring(0, fullName.indexOf(vintage)).trim();
        results.push({
          wine_name: fullName,
          winery: winery,
          vintage: vintage,
          rating: m[3] + " Points",
          price: m[4],
          tasting_notes: m[5].trim(),
        });
      }
      return results;
    }, CFG.maxWines);

    recorder.record("extract", {
      instruction: "Extract wine reviews",
      description: `Extracted ${wines.length} wines`,
      results: wines,
    });

    console.log("\n" + "=".repeat(60));
    console.log(`Wine Enthusiast: ${CFG.query}`);
    console.log("=".repeat(60));
    wines.forEach((w, i) => {
      console.log(`\n  ${i + 1}. ${w.wine_name}`);
      console.log(`     Winery: ${w.winery}`);
      console.log(`     Vintage: ${w.vintage}`);
      console.log(`     Rating: ${w.rating}`);
      console.log(`     Price: ${w.price}`);
      console.log(`     Notes: ${w.tasting_notes.substring(0, 100)}...`);
    });

    const dir = path.join(__dirname);
    fs.writeFileSync(
      path.join(dir, "recorded_actions.json"),
      JSON.stringify(recorder.actions, null, 2)
    );
    console.log(`\n💾 Saved ${recorder.actions.length} actions`);

    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(dir, "wine_search.py"), pyCode);
    console.log("🐍 Saved Python script");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
