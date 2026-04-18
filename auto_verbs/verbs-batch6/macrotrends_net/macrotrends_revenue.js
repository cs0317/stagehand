const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  company: "Apple",
  ticker: "AAPL",
  maxYears: 5,
  waits: { page: 5000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Macrotrends – Revenue History
Company: "${cfg.company}" (${cfg.ticker})

Generated on: ${ts}
Recorded ${n} browser interactions
"""

import re
import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class RevenueRequest:
    company: str = "${cfg.company}"
    ticker: str = "${cfg.ticker}"
    max_years: int = ${cfg.maxYears}


@dataclass
class RevenueYear:
    year: str = ""
    revenue: str = ""


@dataclass
class RevenueResult:
    company: str = ""
    years: List[RevenueYear] = field(default_factory=list)


def macrotrends_revenue(page: Page, request: RevenueRequest) -> RevenueResult:
    """Look up revenue history on Macrotrends."""
    print(f"  Company: {request.company} ({request.ticker})\\n")

    url = f"https://www.macrotrends.net/stocks/charts/{request.ticker}/{request.company.lower()}/revenue"
    print(f"Loading {url}...")
    checkpoint("Navigate to Macrotrends revenue page")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    checkpoint("Extract revenue data")
    years = []
    body_text = page.evaluate("document.body.innerText") or ""

    rows = page.locator("table tbody tr, table.historical_data_table tr").all()
    for row in rows:
        try:
            text = row.inner_text().strip()
            m = re.search(r"(\\d{4})", text)
            rm = re.search(r"\\$([\\d,.]+(?:\\s*[BMK])?)", text)
            if m and rm:
                years.append(RevenueYear(year=m.group(1), revenue="$" + rm.group(1)))
                if len(years) >= request.max_years:
                    break
        except Exception:
            pass

    if not years:
        lines = body_text.split("\\n")
        for line in lines:
            m = re.search(r"(\\d{4}).*?\\$([\\d,.]+(?:\\s*(?:billion|million|B|M))?)", line, re.IGNORECASE)
            if m:
                years.append(RevenueYear(year=m.group(1), revenue="$" + m.group(2)))
                if len(years) >= request.max_years:
                    break

    result = RevenueResult(company=request.company, years=years[:request.max_years])

    print("\\n" + "=" * 60)
    print(f"Macrotrends: {result.company} Revenue History")
    print("=" * 60)
    for ry in result.years:
        print(f"  {ry.year}: {ry.revenue}")
    print(f"\\nTotal: {len(result.years)} years")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("macrotrends_net")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = macrotrends_revenue(page, RevenueRequest())
            print(f"\\nReturned {len(result.years)} years of revenue data")
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
    const revenueUrl = `https://www.macrotrends.net/stocks/charts/${CFG.ticker}/${CFG.company.toLowerCase()}/revenue`;
    console.log(`\n🌐 Loading: ${revenueUrl}...`);
    await page.goto(revenueUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url: revenueUrl, description: "Navigate to Macrotrends revenue" });

    const revenue = await stagehand.extract(
      `extract the annual revenue for the most recent ${CFG.maxYears} years with year and revenue amount`
    );
    console.log("\n📊 Revenue:", JSON.stringify(revenue, null, 2));
    recorder.record("extract", { instruction: "Extract revenue data", results: revenue });

    const dir = path.join(__dirname);
    fs.writeFileSync(path.join(dir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    console.log(`\n💾 Saved ${recorder.actions.length} actions`);

    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(dir, "macrotrends_revenue.py"), pyCode);
    console.log("🐍 Saved Python script");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
