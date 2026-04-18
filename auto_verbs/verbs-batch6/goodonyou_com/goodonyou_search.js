const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  brand: "Patagonia",
  waits: { page: 5000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Good On You – Brand Rating
Brand: "${cfg.brand}"

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
class BrandRequest:
    brand: str = "${cfg.brand}"


@dataclass
class BrandResult:
    name: str = ""
    overall_rating: str = ""
    planet_score: str = ""
    people_score: str = ""
    animals_score: str = ""
    summary: str = ""


def goodonyou_search(page: Page, request: BrandRequest) -> BrandResult:
    """Look up brand rating on Good On You."""
    print(f"  Brand: {request.brand}\\n")

    url = f"https://goodonyou.eco/brand/{request.brand.lower().replace(' ', '-')}/"
    print(f"Loading {url}...")
    checkpoint("Navigate to Good On You brand page")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    checkpoint("Extract brand rating data")
    body_text = page.evaluate("document.body.innerText") or ""

    name = request.brand
    overall_rating = ""
    planet_score = ""
    people_score = ""
    animals_score = ""
    summary = ""

    try:
        h1 = page.locator("h1").first
        if h1.is_visible(timeout=2000):
            name = h1.inner_text().strip()
    except Exception:
        pass

    orm = re.search(r"(?:overall|rated?)[:\\s]*(\\d[\\d.]*\\s*\\/\\s*5|\\w+)", body_text, re.IGNORECASE)
    if orm:
        overall_rating = orm.group(1)

    plm = re.search(r"(?:planet|environment)[:\\s]*(\\w+|\\d[\\d.]*)", body_text, re.IGNORECASE)
    if plm:
        planet_score = plm.group(1)

    pem = re.search(r"(?:people|labour|labor|workers)[:\\s]*(\\w+|\\d[\\d.]*)", body_text, re.IGNORECASE)
    if pem:
        people_score = pem.group(1)

    anm = re.search(r"(?:animals?)[:\\s]*(\\w+|\\d[\\d.]*)", body_text, re.IGNORECASE)
    if anm:
        animals_score = anm.group(1)

    sm = re.search(r"(?:summary|overview|description)[:\\s]+(.+?)(?:\\n\\n|$)", body_text, re.IGNORECASE | re.DOTALL)
    if sm:
        summary = sm.group(1).strip()[:300]

    result = BrandResult(
        name=name, overall_rating=overall_rating,
        planet_score=planet_score, people_score=people_score,
        animals_score=animals_score, summary=summary,
    )

    print("\\n" + "=" * 60)
    print(f"Good On You: {result.name}")
    print("=" * 60)
    print(f"  Overall Rating: {result.overall_rating}")
    print(f"  Planet:         {result.planet_score}")
    print(f"  People:         {result.people_score}")
    print(f"  Animals:        {result.animals_score}")
    print(f"  Summary:        {result.summary[:80]}...")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("goodonyou_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = goodonyou_search(page, BrandRequest())
            print(f"\\nReturned info for {result.name}")
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
    const url = `https://goodonyou.eco/brand/${CFG.brand.toLowerCase().replace(/ /g, '-')}/`;
    console.log(`\n🌐 Loading: ${url}...`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url, description: "Navigate to Good On You" });

    const brandData = await stagehand.extract(
      "extract the brand name, overall rating, planet score, people score, animals score, and rating summary"
    );
    console.log("\n📊 Brand:", JSON.stringify(brandData, null, 2));
    recorder.record("extract", { instruction: "Extract brand rating", results: brandData });

    const dir = path.join(__dirname);
    fs.writeFileSync(path.join(dir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    console.log(`\n💾 Saved ${recorder.actions.length} actions`);

    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(dir, "goodonyou_search.py"), pyCode);
    console.log("🐍 Saved Python script");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
