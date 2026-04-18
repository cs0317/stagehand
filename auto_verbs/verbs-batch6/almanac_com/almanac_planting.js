const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  plant: "tomatoes",
  waits: { page: 5000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Almanac – Planting Guide
Plant: "${cfg.plant}"

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
class PlantRequest:
    plant: str = "${cfg.plant}"


@dataclass
class PlantResult:
    plant_name: str = ""
    planting_season: str = ""
    sun_requirements: str = ""
    soil_requirements: str = ""
    days_to_maturity: str = ""
    spacing: str = ""


def almanac_planting(page: Page, request: PlantRequest) -> PlantResult:
    """Search Almanac for planting guide."""
    print(f"  Plant: {request.plant}\\n")

    url = f"https://www.almanac.com/plant/{quote_plus(request.plant)}"
    print(f"Loading {url}...")
    checkpoint("Navigate to Almanac plant page")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    checkpoint("Extract planting details")
    body_text = page.evaluate("document.body.innerText") or ""

    plant_name = request.plant.title()
    planting_season = ""
    sun_req = ""
    soil_req = ""
    days_maturity = ""
    spacing = ""

    # Plant name
    try:
        h1 = page.locator("h1").first
        if h1.is_visible(timeout=2000):
            plant_name = h1.inner_text().strip()
    except Exception:
        pass

    # Planting season
    pm = re.search(r"(?:Plant(?:ing)?\\s+(?:Season|Time|Dates?))[:\\s]*([^\\n]+)", body_text, re.IGNORECASE)
    if pm:
        planting_season = pm.group(1).strip()

    # Sun
    sm = re.search(r"(?:Sun(?:light)?\\s*(?:Requirements?|Exposure)?)[:\\s]*([^\\n]+)", body_text, re.IGNORECASE)
    if sm:
        sun_req = sm.group(1).strip()
    elif re.search(r"(full sun|partial shade|full shade)", body_text, re.IGNORECASE):
        sun_req = re.search(r"(full sun|partial shade|full shade)", body_text, re.IGNORECASE).group(1)

    # Soil
    slm = re.search(r"(?:Soil)[:\\s]*([^\\n]+)", body_text, re.IGNORECASE)
    if slm:
        soil_req = slm.group(1).strip()

    # Days to maturity
    dm = re.search(r"(?:Days?\\s+to\\s+(?:Maturity|Harvest))[:\\s]*([^\\n]+)", body_text, re.IGNORECASE)
    if dm:
        days_maturity = dm.group(1).strip()

    # Spacing
    spm = re.search(r"(?:Spac(?:e|ing))[:\\s]*([^\\n]+)", body_text, re.IGNORECASE)
    if spm:
        spacing = spm.group(1).strip()

    result = PlantResult(
        plant_name=plant_name,
        planting_season=planting_season,
        sun_requirements=sun_req,
        soil_requirements=soil_req,
        days_to_maturity=days_maturity,
        spacing=spacing,
    )

    print("\\n" + "=" * 60)
    print(f"Almanac: {result.plant_name}")
    print("=" * 60)
    print(f"  Planting Season: {result.planting_season}")
    print(f"  Sun:             {result.sun_requirements}")
    print(f"  Soil:            {result.soil_requirements}")
    print(f"  Days to Maturity:{result.days_to_maturity}")
    print(f"  Spacing:         {result.spacing}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("almanac_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = almanac_planting(page, PlantRequest())
            print(f"\\nReturned info for {result.plant_name}")
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
    const url = "https://www.almanac.com";
    console.log(`\n🌐 Loading: ${url}...`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(3000);
    recorder.record("goto", { url, description: "Navigate to Almanac" });

    // Search for the plant
    try {
      await stagehand.act(`search for "${CFG.plant}"`);
      await page.waitForTimeout(3000);
      recorder.record("act", { description: "Search for plant" });
    } catch (e) {
      // Fallback: navigate directly
      const directUrl = `https://www.almanac.com/plant/${encodeURIComponent(CFG.plant)}`;
      await page.goto(directUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(CFG.waits.page);
    }

    // Click on plant result if on search page
    try {
      await stagehand.act("click the first result about tomatoes planting guide");
      await page.waitForTimeout(CFG.waits.page);
      recorder.record("act", { description: "Click plant result" });
    } catch (e) {
      console.log("   Already on plant page or no result to click");
    }

    const plantData = await stagehand.extract(
      "extract the plant name, planting season, sun requirements, soil requirements, days to maturity, and spacing guidelines"
    );
    console.log("\n📊 Plant Info:", JSON.stringify(plantData, null, 2));
    recorder.record("extract", { instruction: "Extract planting guide", results: plantData });

    const dir = path.join(__dirname);
    fs.writeFileSync(path.join(dir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    console.log(`\n💾 Saved ${recorder.actions.length} actions`);

    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(dir, "almanac_planting.py"), pyCode);
    console.log("🐍 Saved Python script");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
