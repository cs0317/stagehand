const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * AirNow – Air Quality Index Lookup
 *
 * Looks up the current AQI for a zip code on airnow.gov and extracts
 * location, AQI value, category, primary pollutant, and health recommendations.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  zipCode: "90210",
  waits: { page: 5000 },
};

// ── Python Script Generator ──────────────────────────────────────────────────
function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
AirNow – Air Quality Index Lookup
Zip Code: "${cfg.zipCode}"

Generated on: ${ts}
Recorded ${n} browser interactions

Uses Playwright's native locator API with the user's Chrome profile.
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
class AQIRequest:
    zip_code: str = "${cfg.zipCode}"


@dataclass
class AQIResult:
    location: str = ""
    aqi_value: str = ""
    aqi_category: str = ""
    primary_pollutant: str = ""
    health_recommendation: str = ""


def airnow_aqi(page: Page, request: AQIRequest) -> AQIResult:
    """Look up AQI on AirNow.gov."""
    print(f"  Zip Code: {request.zip_code}\\n")

    # ── Navigate ──────────────────────────────────────────────────────
    url = f"https://www.airnow.gov/?city=&state=&country=USA&zipcode={request.zip_code}"
    print(f"Loading {url}...")
    checkpoint("Navigate to AirNow")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    # ── Extract AQI data ──────────────────────────────────────────────
    checkpoint("Extract AQI data")

    location = ""
    aqi_value = ""
    aqi_category = ""
    primary_pollutant = ""
    health_rec = ""

    # Location
    for sel in ['.location-name', 'h2', '.city-name', '#location']:
        try:
            el = page.locator(sel).first
            if el.is_visible(timeout=2000):
                location = el.inner_text().strip()
                if location:
                    break
        except Exception:
            pass

    # AQI value
    for sel in ['.aqi-value', '.aqi-number', '[class*="aqi"]', '.gauge-value']:
        try:
            el = page.locator(sel).first
            if el.is_visible(timeout=2000):
                text = el.inner_text().strip()
                m = re.search(r"(\\\\d+)", text)
                if m:
                    aqi_value = m.group(1)
                    break
        except Exception:
            pass

    # AQI category
    for sel in ['.aqi-category', '.aqi-label', '[class*="category"]']:
        try:
            el = page.locator(sel).first
            if el.is_visible(timeout=2000):
                aqi_category = el.inner_text().strip()
                if aqi_category:
                    break
        except Exception:
            pass

    # Fallback: extract from page text
    if not aqi_category:
        body_text = page.evaluate("document.body.innerText") or ""
        for cat in ["Good", "Moderate", "Unhealthy for Sensitive Groups", "Unhealthy", "Very Unhealthy", "Hazardous"]:
            if cat in body_text:
                aqi_category = cat
                break

    # Primary pollutant
    body_text = page.evaluate("document.body.innerText") or ""
    for pollutant in ["PM2.5", "PM10", "O3", "Ozone", "NO2", "SO2", "CO"]:
        if pollutant in body_text:
            primary_pollutant = pollutant
            break

    # Health recommendation
    for sel in ['.health-message', '.action-day', '[class*="health"]']:
        try:
            el = page.locator(sel).first
            if el.is_visible(timeout=2000):
                health_rec = el.inner_text().strip()
                if health_rec:
                    break
        except Exception:
            pass

    result = AQIResult(
        location=location,
        aqi_value=aqi_value,
        aqi_category=aqi_category,
        primary_pollutant=primary_pollutant,
        health_recommendation=health_rec,
    )

    # ── Print results ─────────────────────────────────────────────────
    print("\\n" + "=" * 60)
    print(f"AirNow AQI: {request.zip_code}")
    print("=" * 60)
    print(f"  Location:          {result.location}")
    print(f"  AQI Value:         {result.aqi_value}")
    print(f"  Category:          {result.aqi_category}")
    print(f"  Primary Pollutant: {result.primary_pollutant}")
    print(f"  Health Advice:     {result.health_recommendation}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("airnow_gov")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = airnow_aqi(page, AQIRequest())
            print(f"\\nDone. AQI: {result.aqi_value} ({result.aqi_category})")
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
    const url = `https://www.airnow.gov/?city=&state=&country=USA&zipcode=${CFG.zipCode}`;
    console.log(`\n🌐 Navigating to ${url}...`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url, description: "Navigate to AirNow" });

    // Extract AQI data using Stagehand
    const aqiData = await stagehand.extract(
      "extract the location name, current AQI value, AQI category, primary pollutant, and any health recommendations"
    );
    console.log("\n📊 AQI Data:", JSON.stringify(aqiData, null, 2));
    recorder.record("extract", {
      instruction: "Extract AQI data",
      description: "Extracted AQI information",
      results: aqiData,
    });

    const dir = path.join(__dirname);
    fs.writeFileSync(path.join(dir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    console.log(`\n💾 Saved ${recorder.actions.length} actions`);

    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(dir, "airnow_aqi.py"), pyCode);
    console.log("🐍 Saved Python script");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
