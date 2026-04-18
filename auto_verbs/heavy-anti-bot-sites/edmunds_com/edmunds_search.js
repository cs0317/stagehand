const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  car: "2024 Honda Civic",
  waits: { page: 5000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Edmunds – Car Review
Car: "${cfg.car}"

Generated on: ${ts}
Recorded ${n} browser interactions
"""

import re
import os, sys, shutil
from dataclasses import dataclass
from urllib.parse import quote_plus
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class CarRequest:
    car: str = "${cfg.car}"


@dataclass
class CarResult:
    model: str = ""
    rating: str = ""
    msrp: str = ""
    mpg: str = ""
    pros: str = ""
    cons: str = ""


def edmunds_search(page: Page, request: CarRequest) -> CarResult:
    """Search Edmunds for car reviews."""
    print(f"  Car: {request.car}\\n")

    url = "https://www.edmunds.com/honda/civic/2024/review/"
    print(f"Loading {url}...")
    checkpoint("Navigate to Edmunds review page")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    checkpoint("Extract car review data")
    body_text = page.evaluate("document.body.innerText") or ""

    model = request.car
    rating = ""
    msrp = ""
    mpg = ""
    pros = ""
    cons = ""

    try:
        h1 = page.locator("h1").first
        if h1.is_visible(timeout=2000):
            model = h1.inner_text().strip()
    except Exception:
        pass

    rm = re.search(r"(\\d+\\.?\\d*)\\s*(?:/\\s*10|out of 10)", body_text)
    if rm:
        rating = rm.group(1) + "/10"

    pm = re.search(r"(?:MSRP|Starting)[:\\s]*\\$(\\d[\\d,]*)", body_text, re.IGNORECASE)
    if pm:
        msrp = "$" + pm.group(1)

    mm = re.search(r"(\\d+)\\s*(?:city|mpg)\\s*/\\s*(\\d+)\\s*(?:hwy|highway)", body_text, re.IGNORECASE)
    if mm:
        mpg = f"{mm.group(1)} city / {mm.group(2)} hwy"

    prom = re.search(r"(?:Pros?|What we like)[:\\s]*(.+?)(?:Cons?|What we don)", body_text, re.IGNORECASE | re.DOTALL)
    if prom:
        pros = prom.group(1).strip()[:200]

    conm = re.search(r"(?:Cons?|What we don.t like)[:\\s]*(.+?)(?:\\n\\n|$)", body_text, re.IGNORECASE | re.DOTALL)
    if conm:
        cons = conm.group(1).strip()[:200]

    result = CarResult(
        model=model, rating=rating, msrp=msrp,
        mpg=mpg, pros=pros, cons=cons,
    )

    print("\\n" + "=" * 60)
    print(f"Edmunds: {result.model}")
    print("=" * 60)
    print(f"  Rating:  {result.rating}")
    print(f"  MSRP:    {result.msrp}")
    print(f"  MPG:     {result.mpg}")
    print(f"  Pros:    {result.pros[:80]}...")
    print(f"  Cons:    {result.cons[:80]}...")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("edmunds_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = edmunds_search(page, CarRequest())
            print(f"\\nReturned info for {result.model}")
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
    const url = "https://www.edmunds.com/honda/civic/2024/review/";
    console.log(`\n🌐 Loading: ${url}...`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url, description: "Navigate to Edmunds review" });

    const carData = await stagehand.extract(
      "extract the model name, edmunds rating, MSRP price range, MPG (city/highway), and pros/cons summary"
    );
    console.log("\n📊 Car:", JSON.stringify(carData, null, 2));
    recorder.record("extract", { instruction: "Extract car review", results: carData });

    const dir = path.join(__dirname);
    fs.writeFileSync(path.join(dir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    console.log(`\n💾 Saved ${recorder.actions.length} actions`);

    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(dir, "edmunds_search.py"), pyCode);
    console.log("🐍 Saved Python script");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
