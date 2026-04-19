const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Weather.gov – Get weather forecast from the National Weather Service
 */

const CFG = {
  latitude: "41.8781",
  longitude: "-87.6298",
  maxResults: 7,
  waits: { page: 5000, action: 2000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Weather.gov – Get weather forecast from the National Weather Service

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
class WeatherGovSearchRequest:
    latitude: str = "${cfg.latitude}"
    longitude: str = "${cfg.longitude}"
    max_results: int = ${cfg.maxResults}


@dataclass
class WeatherGovForecastItem:
    period: str = ""
    temperature: str = ""
    wind_speed: str = ""
    wind_direction: str = ""
    forecast_summary: str = ""
    icon_description: str = ""


@dataclass
class WeatherGovSearchResult:
    items: List[WeatherGovForecastItem] = field(default_factory=list)


# Get weather forecast from the National Weather Service.
def weather_gov_search(page: Page, request: WeatherGovSearchRequest) -> WeatherGovSearchResult:
    """Get weather forecast from the National Weather Service."""
    print(f"  Location: {request.latitude}, {request.longitude}\\n")

    url = f"https://forecast.weather.gov/MapClick.php?lat={request.latitude}&lon={request.longitude}"
    print(f"Loading {url}...")
    checkpoint("Navigate to NWS forecast page")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    result = WeatherGovSearchResult()

    checkpoint("Extract forecast periods")
    js_code = """(max) => {
        const periods = document.querySelectorAll('#seven-day-forecast-body .tombstone-container, [class*="forecast-tombstone"], [id*="seven-day"] li, .row-forecast .forecast-text, #detailed-forecast-body .row');
        const items = [];
        for (const el of periods) {
            if (items.length >= max) break;
            const periodEl = el.querySelector('.period-name, [class*="period"], b, strong');
            const tempEl = el.querySelector('.temp, [class*="temp"], [class*="Temp"]');
            const windEl = el.querySelector('[class*="wind"], [class*="Wind"]');
            const descEl = el.querySelector('.short-desc, [class*="desc"], [class*="forecast"], p');
            const iconEl = el.querySelector('img');

            const period = periodEl ? periodEl.textContent.trim() : '';
            const temperature = tempEl ? tempEl.textContent.trim() : '';
            const windText = windEl ? windEl.textContent.trim() : '';
            const wind_speed = windText;
            const wind_direction = '';
            const forecast_summary = descEl ? descEl.textContent.trim() : '';
            const icon_description = iconEl ? (iconEl.getAttribute('alt') || iconEl.getAttribute('title') || '') : '';

            if (period) {
                items.push({period, temperature, wind_speed, wind_direction, forecast_summary, icon_description});
            }
        }
        return items;
    }"""
    items_data = page.evaluate(js_code, request.max_results)

    for d in items_data:
        item = WeatherGovForecastItem()
        item.period = d.get("period", "")
        item.temperature = d.get("temperature", "")
        item.wind_speed = d.get("wind_speed", "")
        item.wind_direction = d.get("wind_direction", "")
        item.forecast_summary = d.get("forecast_summary", "")
        item.icon_description = d.get("icon_description", "")
        result.items.append(item)

    for i, item in enumerate(result.items, 1):
        print(f"\\n  Period {i}:")
        print(f"    Period:    {item.period}")
        print(f"    Temp:      {item.temperature}")
        print(f"    Wind:      {item.wind_speed} {item.wind_direction}")
        print(f"    Forecast:  {item.forecast_summary}")
        print(f"    Icon:      {item.icon_description}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("weather_gov")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            request = WeatherGovSearchRequest()
            result = weather_gov_search(page, request)
            print("\\n=== DONE ===")
            print(f"Found {len(result.items)} forecast periods")
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
    const url = `https://forecast.weather.gov/MapClick.php?lat=${CFG.latitude}&lon=${CFG.longitude}`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    recorder.record("navigate", url, `Navigate to ${url}`);
    await page.waitForTimeout(CFG.waits.page);

    const data = await stagehand.extract(
      `Extract the first ${CFG.maxResults} forecast periods. For each get the period name, temperature, wind speed, wind direction, forecast summary, and icon description.`
    );
    recorder.record("extract", "forecast periods", JSON.stringify(data));
    console.log("Extracted:", JSON.stringify(data, null, 2));

    const outDir = __dirname;
    fs.writeFileSync(path.join(outDir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    fs.writeFileSync(path.join(outDir, "weather_gov_search.py"), genPython(CFG, recorder));
    console.log("Saved weather_gov_search.py");
  } finally {
    await stagehand.close();
  }
})();
