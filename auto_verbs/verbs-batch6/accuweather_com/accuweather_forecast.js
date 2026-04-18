const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * AccuWeather – Weather Forecast
 *
 * Searches accuweather.com for weather in a given location and extracts
 * current conditions plus a 5-day forecast.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  location: "San Francisco, CA",
  waits: { page: 5000, type: 1000 },
};

// ── Python Script Generator ──────────────────────────────────────────────────
function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
AccuWeather – Weather Forecast
Location: "${cfg.location}"

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
class WeatherRequest:
    location: str = "${cfg.location}"


@dataclass
class DayForecast:
    day: str = ""
    high: str = ""
    low: str = ""
    condition: str = ""


@dataclass
class WeatherResult:
    current_temp: str = ""
    condition: str = ""
    high: str = ""
    low: str = ""
    humidity: str = ""
    wind: str = ""
    forecast: list = field(default_factory=list)


def accuweather_forecast(page: Page, request: WeatherRequest) -> WeatherResult:
    """Get weather forecast from AccuWeather."""
    print(f"  Location: {request.location}\\n")

    # ── Navigate to AccuWeather ───────────────────────────────────────
    url = "https://www.accuweather.com"
    print(f"Loading {url}...")
    checkpoint("Navigate to AccuWeather")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(3000)

    # ── Dismiss cookie/consent banners ────────────────────────────────
    for sel in [
        "button.banner-button.policy-accept",
        "button:has-text('I Accept')",
        "button:has-text('Accept')",
        "button#onetrust-accept-btn-handler",
    ]:
        try:
            btn = page.locator(sel).first
            if btn.is_visible(timeout=2000):
                btn.click()
                page.wait_for_timeout(500)
        except Exception:
            pass

    # ── Search for location ───────────────────────────────────────────
    print(f"Searching for {request.location}...")
    checkpoint("Enter location in search")
    search_input = page.locator(
        'input[data-qa="searchBox"], '
        'input[name="query"], '
        'input[placeholder*="Search"], '
        'input.search-input'
    ).first
    search_input.click()
    page.wait_for_timeout(500)
    search_input.press("Control+a")
    search_input.type(request.location, delay=50)
    page.wait_for_timeout(2000)

    # Select first suggestion
    try:
        suggestion = page.locator(
            '[data-qa="searchResult"], '
            '.search-bar-result, '
            'a[class*="search-result"], '
            'ul.search-results li a'
        ).first
        suggestion.wait_for(state="visible", timeout=5000)
        suggestion.click()
        print("  Selected first suggestion")
    except Exception:
        page.keyboard.press("Enter")
        print("  Pressed Enter")
    page.wait_for_timeout(5000)

    # ── Extract current conditions ────────────────────────────────────
    checkpoint("Extract current weather")

    current_temp = ""
    condition = ""
    high = ""
    low = ""
    humidity = ""
    wind = ""

    # Current temperature
    for sel in ['.temp', '.header-temp', '[data-qa="currentTemp"]', '.current-weather .temp']:
        try:
            el = page.locator(sel).first
            if el.is_visible(timeout=2000):
                current_temp = el.inner_text().strip()
                break
        except Exception:
            pass

    # Weather condition
    for sel in ['.phrase', '[data-qa="weatherPhrase"]', '.current-weather .phrase']:
        try:
            el = page.locator(sel).first
            if el.is_visible(timeout=2000):
                condition = el.inner_text().strip()
                break
        except Exception:
            pass

    # High/Low
    for sel in ['.temp-hi-lo', '[data-qa="highLow"]', '.high-low']:
        try:
            el = page.locator(sel).first
            if el.is_visible(timeout=2000):
                text = el.inner_text().strip()
                temps = re.findall(r"(\\\\d+)", text)
                if len(temps) >= 2:
                    high = temps[0] + chr(176)
                    low = temps[1] + chr(176)
                break
        except Exception:
            pass

    # Humidity and Wind from detail items
    detail_items = page.locator('.detail-item, [data-qa="details"] .detail-item').all()
    for item in detail_items:
        try:
            label = item.locator('.label, dt').first.inner_text().strip().lower()
            value = item.locator('.value, dd').first.inner_text().strip()
            if 'humidity' in label:
                humidity = value
            elif 'wind' in label:
                wind = value
        except Exception:
            pass

    # ── Extract 5-day forecast ────────────────────────────────────────
    checkpoint("Extract 5-day forecast")
    forecast = []
    forecast_cards = page.locator(
        '.daily-wrapper a, '
        '[data-qa="dailyForecast"] a, '
        '.daily-list a'
    ).all()

    for card in forecast_cards[:5]:
        try:
            text = card.inner_text().strip()
            lines = [l.strip() for l in text.split("\\\\n") if l.strip()]
            if len(lines) >= 2:
                day = lines[0]
                temps = re.findall(r"(\\\\d+)", text)
                cond = ""
                for l in lines[1:]:
                    if not re.match(r"^\\\\d", l) and chr(176) not in l:
                        cond = l
                        break
                forecast.append({
                    "day": day,
                    "high": (temps[0] + chr(176)) if temps else "",
                    "low": (temps[1] + chr(176)) if len(temps) > 1 else "",
                    "condition": cond,
                })
        except Exception:
            pass

    # ── Build result ──────────────────────────────────────────────────
    result = WeatherResult(
        current_temp=current_temp,
        condition=condition,
        high=high,
        low=low,
        humidity=humidity,
        wind=wind,
        forecast=[DayForecast(**d) for d in forecast],
    )

    # ── Print results ─────────────────────────────────────────────────
    print("\\n" + "=" * 60)
    print(f"AccuWeather: {request.location}")
    print("=" * 60)
    print(f"  Temperature: {result.current_temp}")
    print(f"  Condition:   {result.condition}")
    print(f"  High/Low:    {result.high} / {result.low}")
    print(f"  Humidity:    {result.humidity}")
    print(f"  Wind:        {result.wind}")
    if result.forecast:
        print("\\n  5-Day Forecast:")
        for d in result.forecast:
            print(f"    {d.day}: {d.high}/{d.low} - {d.condition}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("accuweather_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = accuweather_forecast(page, WeatherRequest())
            print(f"\\nDone. Condition: {result.condition}")
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
    const url = "https://www.accuweather.com";
    console.log(`\n🌐 Navigating to ${url}...`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url, description: "Navigate to AccuWeather" });

    // Dismiss cookie banners
    for (const sel of [
      "button.banner-button.policy-accept",
      "button:has-text('I Accept')",
      "button:has-text('Accept')",
      "button#onetrust-accept-btn-handler",
    ]) {
      try {
        const btn = page.locator(sel).first();
        if (await btn.isVisible({ timeout: 2000 })) {
          await btn.click();
          await page.waitForTimeout(500);
        }
      } catch (e) { /* no banner */ }
    }

    // Search for location
    console.log(`\n🔍 Searching for "${CFG.location}"...`);
    await stagehand.act(`click the search box and type "${CFG.location}"`);
    await page.waitForTimeout(CFG.waits.type);
    recorder.record("search", { location: CFG.location, description: `Searched for ${CFG.location}` });

    // Select first suggestion
    try {
      await stagehand.act("click the first search suggestion");
      await page.waitForTimeout(CFG.waits.page);
      recorder.record("select", { description: "Selected first suggestion" });
    } catch (e) {
      console.log("   No suggestion found, pressing Enter");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(CFG.waits.page);
    }

    // Extract current conditions
    const currentData = await stagehand.extract(
      "extract the current temperature, weather condition, high/low temps, humidity, and wind speed"
    );
    console.log("\n📊 Current conditions:", JSON.stringify(currentData, null, 2));
    recorder.record("extract", {
      instruction: "Extract current weather",
      description: "Extracted current conditions",
      results: currentData,
    });

    const dir = path.join(__dirname);
    fs.writeFileSync(
      path.join(dir, "recorded_actions.json"),
      JSON.stringify(recorder.actions, null, 2)
    );
    console.log(`\n💾 Saved ${recorder.actions.length} actions`);

    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(dir, "accuweather_forecast.py"), pyCode);
    console.log("🐍 Saved Python script");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
