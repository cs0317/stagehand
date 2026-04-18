const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  query: "disaster relief",
  maxCharities: 5,
  waits: { page: 5000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Charity Navigator – Charity Search
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
class CharityRequest:
    query: str = "${cfg.query}"
    max_charities: int = ${cfg.maxCharities}


@dataclass
class Charity:
    name: str = ""
    rating: str = ""
    financial_score: str = ""
    accountability_score: str = ""
    url: str = ""


@dataclass
class CharityResult:
    charities: list = field(default_factory=list)


def charitynavigator_search(page: Page, request: CharityRequest) -> CharityResult:
    """Search Charity Navigator for charities."""
    print(f"  Query: {request.query}\\n")

    url = f"https://www.charitynavigator.org/search?q={quote_plus(request.query)}"
    print(f"Loading {url}...")
    checkpoint("Navigate to Charity Navigator search")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    checkpoint("Extract charity listings")
    charities_data = page.evaluate(r"""(maxCharities) => {
        const results = [];
        const items = document.querySelectorAll(
            '[class*="result"], [class*="charity"], article, a[href*="/ein/"]'
        );
        const seen = new Set();
        for (const item of items) {
            if (results.length >= maxCharities) break;
            const nameEl = item.querySelector('h2, h3, h4, [class*="name"], [class*="title"]');
            const name = nameEl ? nameEl.innerText.trim() : '';
            if (!name || name.length < 3 || seen.has(name)) continue;
            seen.add(name);

            const text = item.innerText || '';
            let rating = '', financial_score = '', accountability_score = '';

            const ratingM = text.match(/(\\d)\\s*(?:\\/\\s*4|out of 4|star)/i);
            if (ratingM) rating = ratingM[1] + "/4";

            const finM = text.match(/(?:Financial|Finance)[:\\s]*(\\d+)/i);
            if (finM) financial_score = finM[1];

            const accM = text.match(/(?:Accountability|Account)[:\\s]*(\\d+)/i);
            if (accM) accountability_score = accM[1];

            const linkEl = item.tagName === 'A' ? item : item.querySelector('a');
            const url = linkEl ? linkEl.href : '';

            results.push({ name, rating, financial_score, accountability_score, url });
        }
        return results;
    }""", request.max_charities)

    result = CharityResult(charities=[Charity(**c) for c in charities_data])

    print("\\n" + "=" * 60)
    print(f"Charity Navigator: {request.query}")
    print("=" * 60)
    for c in result.charities:
        print(f"  {c.name}")
        print(f"    Rating: {c.rating}  Financial: {c.financial_score}  Accountability: {c.accountability_score}")
        print(f"    URL: {c.url}")
    print(f"\\n  Total: {len(result.charities)} charities")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("charitynavigator_org")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = charitynavigator_search(page, CharityRequest())
            print(f"\\nReturned {len(result.charities)} charities")
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
    const url = `https://www.charitynavigator.org/search?q=${encodeURIComponent(CFG.query)}`;
    console.log(`\n🌐 Searching: ${url}...`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url, description: "Search Charity Navigator" });

    const charitiesData = await stagehand.extract(
      "extract up to 5 charities with charity name, overall rating, financial health score, accountability score, and charity URL"
    );
    console.log("\n📊 Charities:", JSON.stringify(charitiesData, null, 2));
    recorder.record("extract", { instruction: "Extract charities", results: charitiesData });

    const dir = path.join(__dirname);
    fs.writeFileSync(path.join(dir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    console.log(`\n💾 Saved ${recorder.actions.length} actions`);

    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(dir, "charitynavigator_search.py"), pyCode);
    console.log("🐍 Saved Python script");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
