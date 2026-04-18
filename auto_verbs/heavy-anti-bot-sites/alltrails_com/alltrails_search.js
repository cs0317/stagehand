const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  query: "Yosemite National Park",
  maxTrails: 5,
  waits: { page: 5000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
AllTrails – Trail Search
Query: "${cfg.query}"

Generated on: ${ts}
Recorded ${n} browser interactions
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
class TrailRequest:
    query: str = "${cfg.query}"
    max_trails: int = ${cfg.maxTrails}


@dataclass
class Trail:
    name: str = ""
    difficulty: str = ""
    length: str = ""
    elevation_gain: str = ""
    rating: str = ""


@dataclass
class TrailResult:
    trails: list = field(default_factory=list)


def alltrails_search(page: Page, request: TrailRequest) -> TrailResult:
    """Search AllTrails for hiking trails."""
    print(f"  Query: {request.query}\\n")

    search_url = f"https://www.alltrails.com/search?q={quote_plus(request.query)}"
    print(f"Loading {search_url}...")
    checkpoint("Navigate to AllTrails search")
    page.goto(search_url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    # Extract trail listings
    checkpoint("Extract trail data")
    trails_data = page.evaluate(r"""(maxTrails) => {
        const results = [];
        const cards = document.querySelectorAll(
            '[data-testid="trail-card"], .trail-card, [class*="TrailCard"], a[href*="/trail/"]'
        );
        for (const card of cards) {
            if (results.length >= maxTrails) break;
            const text = card.innerText || '';
            const lines = text.split('\\n').map(l => l.trim()).filter(Boolean);
            const name = lines[0] || '';
            if (!name || name.length < 3 || name.length > 200) continue;

            let difficulty = '', length = '', elevation = '', rating = '';
            for (const line of lines) {
                if (/easy|moderate|hard|difficult/i.test(line) && !difficulty) {
                    difficulty = line;
                }
                if (/\\d+(\\.\\d+)?\\s*(mi|mile|km)/i.test(line) && !length) {
                    const m = line.match(/(\\d+(?:\\.\\d+)?\\s*(?:mi|mile|km))/i);
                    if (m) length = m[1];
                }
                if (/\\d+.*(?:ft|m|elev)/i.test(line) && !elevation) {
                    const m = line.match(/(\\d[\\d,]*\\s*(?:ft|m))/i);
                    if (m) elevation = m[1];
                }
                if (/\\d+\\.\\d/.test(line) && !rating && line.length < 10) {
                    rating = line;
                }
            }
            results.push({ name, difficulty, length, elevation_gain: elevation, rating });
        }
        return results;
    }""", request.max_trails)

    result = TrailResult(trails=[Trail(**t) for t in trails_data])

    print("\\n" + "=" * 60)
    print(f"AllTrails: {request.query}")
    print("=" * 60)
    for t in result.trails:
        print(f"  {t.name}")
        print(f"    Difficulty: {t.difficulty}  Length: {t.length}")
        print(f"    Elevation:  {t.elevation_gain}  Rating: {t.rating}")
    print(f"\\n  Total: {len(result.trails)} trails")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("alltrails_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = alltrails_search(page, TrailRequest())
            print(f"\\nReturned {len(result.trails)} trails")
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
    const searchUrl = `https://www.alltrails.com/search?q=${encodeURIComponent(CFG.query)}`;
    console.log(`\n🌐 Searching: ${searchUrl}...`);
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url: searchUrl, description: "Search AllTrails" });

    const trailData = await stagehand.extract(
      "extract up to 5 hiking trail results with trail name, difficulty, length in miles, elevation gain, and average rating"
    );
    console.log("\n📊 Trails:", JSON.stringify(trailData, null, 2));
    recorder.record("extract", { instruction: "Extract trail listings", results: trailData });

    const dir = path.join(__dirname);
    fs.writeFileSync(path.join(dir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    console.log(`\n💾 Saved ${recorder.actions.length} actions`);

    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(dir, "alltrails_search.py"), pyCode);
    console.log("🐍 Saved Python script");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
