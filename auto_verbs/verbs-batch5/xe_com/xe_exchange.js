const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * XE – Currency Exchange Rate Lookup
 *
 * Navigates to xe.com currency converter and extracts
 * current rate, inverse rate, and 30-day statistics.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  fromCurrency: "USD",
  toCurrency: "EUR",
  waits: { page: 8000 },
};

// ── Python Script Generator ──────────────────────────────────────────────────
function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
XE – Currency Exchange Rate Lookup
From: ${cfg.fromCurrency}, To: ${cfg.toCurrency}

Generated on: ${ts}
Recorded ${n} browser interactions

Uses Playwright's native locator API with the user's Chrome profile.
"""

import re
import os, sys, shutil
from dataclasses import dataclass
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class XERequest:
    from_currency: str = "${cfg.fromCurrency}"
    to_currency: str = "${cfg.toCurrency}"


@dataclass
class ExchangeRate:
    from_currency: str = ""
    to_currency: str = ""
    current_rate: str = ""
    inverse_rate: str = ""
    high_30d: str = ""
    low_30d: str = ""
    avg_30d: str = ""
    volatility_30d: str = ""


def xe_lookup(page: Page, request: XERequest) -> ExchangeRate:
    """Look up currency exchange rate on XE."""
    print(f"  From: {request.from_currency}")
    print(f"  To:   {request.to_currency}\\n")

    # ── Navigate to converter ─────────────────────────────────────────
    url = f"https://www.xe.com/currencyconverter/convert/?Amount=1&From={request.from_currency}&To={request.to_currency}"
    print(f"Loading {url}...")
    checkpoint("Navigate to XE converter")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(${cfg.waits.page})

    # Scroll to load statistics section
    for _ in range(3):
        page.evaluate("window.scrollBy(0, 1500)")
        page.wait_for_timeout(500)

    # ── Extract rates ─────────────────────────────────────────────────
    data = page.evaluate(r"""(args) => {
        const { from_cur, to_cur } = args;
        const text = document.body.innerText;

        // Current rate: "1.00 USD = 0.85005031 EUR"
        let currentRate = '';
        const rateMatch = text.match(new RegExp('1\\\\.00\\\\s+' + from_cur + '\\\\s*=\\\\s*([\\\\d.]+)\\\\s+' + to_cur));
        if (rateMatch) currentRate = rateMatch[1];

        // Inverse rate: from the conversion table "1 EUR   1.1764 USD"
        let inverseRate = '';
        const invMatch = text.match(new RegExp('1\\\\s+' + to_cur + '\\\\s+([\\\\d.]+)\\\\s+' + from_cur));
        if (invMatch) inverseRate = invMatch[1];

        // 30-day stats from the statistics table
        // Pattern: High (next line) 0.8565 0.8729 0.8745 (7d, 30d, 90d)
        const NL = String.fromCharCode(10);
        const lines = text.split(NL);
        let high30 = '', low30 = '', avg30 = '', vol30 = '';

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line === 'High' && i + 1 < lines.length) {
                const vals = lines[i + 1].trim().split(/\\s+/);
                if (vals.length >= 2) high30 = vals[1]; // 30-day is second
            }
            if (line === 'Low' && i + 1 < lines.length) {
                const vals = lines[i + 1].trim().split(/\\s+/);
                if (vals.length >= 2) low30 = vals[1];
            }
            if (line === 'Average' && i + 1 < lines.length) {
                const vals = lines[i + 1].trim().split(/\\s+/);
                if (vals.length >= 2) avg30 = vals[1];
            }
            if (line === 'Volatility' && i + 1 < lines.length) {
                const vals = lines[i + 1].trim().split(/\\s+/);
                if (vals.length >= 2) vol30 = vals[1];
            }
        }

        return { currentRate, inverseRate, high30, low30, avg30, vol30 };
    }""", {"from_cur": request.from_currency, "to_cur": request.to_currency})

    # ── Print results ─────────────────────────────────────────────────
    print("\\n" + "=" * 60)
    print(f"XE: {request.from_currency} → {request.to_currency}")
    print("=" * 60)
    print(f"\\n  Current Rate:  1 {request.from_currency} = {data['currentRate']} {request.to_currency}")
    print(f"  Inverse Rate:  1 {request.to_currency} = {data['inverseRate']} {request.from_currency}")
    print(f"\\n  30-Day Statistics:")
    print(f"    High:        {data['high30']}")
    print(f"    Low:         {data['low30']}")
    print(f"    Average:     {data['avg30']}")
    print(f"    Volatility:  {data['vol30']}")

    return ExchangeRate(
        from_currency=request.from_currency,
        to_currency=request.to_currency,
        current_rate=data['currentRate'],
        inverse_rate=data['inverseRate'],
        high_30d=data['high30'],
        low_30d=data['low30'],
        avg_30d=data['avg30'],
        volatility_30d=data['vol30'],
    )


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("xe_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = xe_lookup(page, XERequest())
            print(f"\\nReturned: 1 {result.from_currency} = {result.current_rate} {result.to_currency}")
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
    const url = `https://www.xe.com/currencyconverter/convert/?Amount=1&From=${CFG.fromCurrency}&To=${CFG.toCurrency}`;
    console.log(`\n🌐 Loading: ${url}...`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url, description: "Navigate to XE converter" });

    // Scroll to load statistics section
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, 1500));
      await page.waitForTimeout(500);
    }

    const data = await page.evaluate((args) => {
      const { from_cur, to_cur } = args;
      const text = document.body.innerText;

      // Current rate: "1.00 USD = 0.85005031 EUR"
      let currentRate = "";
      const rateMatch = text.match(new RegExp("1\\.00\\s+" + from_cur + "\\s*=\\s*([\\d.]+)\\s+" + to_cur));
      if (rateMatch) currentRate = rateMatch[1];

      // Inverse rate: "1 EUR   1.1764 USD"
      let inverseRate = "";
      const invMatch = text.match(new RegExp("1\\s+" + to_cur + "\\s+([\\d.]+)\\s+" + from_cur));
      if (invMatch) inverseRate = invMatch[1];

      // 30-day stats
      const lines = text.split("\n");
      let high30 = "", low30 = "", avg30 = "", vol30 = "";

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line === "High" && i + 1 < lines.length) {
          const vals = lines[i + 1].trim().split(/\s+/);
          if (vals.length >= 2) high30 = vals[1];
        }
        if (line === "Low" && i + 1 < lines.length) {
          const vals = lines[i + 1].trim().split(/\s+/);
          if (vals.length >= 2) low30 = vals[1];
        }
        if (line === "Average" && i + 1 < lines.length) {
          const vals = lines[i + 1].trim().split(/\s+/);
          if (vals.length >= 2) avg30 = vals[1];
        }
        if (line === "Volatility" && i + 1 < lines.length) {
          const vals = lines[i + 1].trim().split(/\s+/);
          if (vals.length >= 2) vol30 = vals[1];
        }
      }

      return { currentRate, inverseRate, high30, low30, avg30, vol30 };
    }, { from_cur: CFG.fromCurrency, to_cur: CFG.toCurrency });

    recorder.record("extract", {
      instruction: "Extract exchange rate data",
      description: `Extracted 1 ${CFG.fromCurrency} = ${data.currentRate} ${CFG.toCurrency}`,
      results: data,
    });

    console.log("\n" + "=".repeat(60));
    console.log(`XE: ${CFG.fromCurrency} → ${CFG.toCurrency}`);
    console.log("=".repeat(60));
    console.log(`\n  Current Rate:  1 ${CFG.fromCurrency} = ${data.currentRate} ${CFG.toCurrency}`);
    console.log(`  Inverse Rate:  1 ${CFG.toCurrency} = ${data.inverseRate} ${CFG.fromCurrency}`);
    console.log("\n  30-Day Statistics:");
    console.log(`    High:        ${data.high30}`);
    console.log(`    Low:         ${data.low30}`);
    console.log(`    Average:     ${data.avg30}`);
    console.log(`    Volatility:  ${data.vol30}`);

  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    const dir = path.join(__dirname);
    fs.writeFileSync(
      path.join(dir, "recorded_actions.json"),
      JSON.stringify(recorder.actions, null, 2)
    );
    console.log(`\n💾 Saved ${recorder.actions.length} actions`);

    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(dir, "xe_exchange.py"), pyCode);
    console.log("🐍 Saved Python script");

    await stagehand.close();
    process.exit(0);
  }
})();
