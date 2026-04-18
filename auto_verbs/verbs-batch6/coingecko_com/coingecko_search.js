const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  coin: "ethereum",
  waits: { page: 5000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
CoinGecko – Cryptocurrency Info
Coin: "${cfg.coin}"

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
class CoinRequest:
    coin: str = "${cfg.coin}"


@dataclass
class CoinResult:
    name: str = ""
    price: str = ""
    change_24h: str = ""
    volume_24h: str = ""
    market_cap: str = ""
    all_time_high: str = ""


def coingecko_search(page: Page, request: CoinRequest) -> CoinResult:
    """Get cryptocurrency info from CoinGecko."""
    print(f"  Coin: {request.coin}\\n")

    url = f"https://www.coingecko.com/en/coins/{request.coin}"
    print(f"Loading {url}...")
    checkpoint("Navigate to CoinGecko coin page")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    checkpoint("Extract coin data")
    body_text = page.evaluate("document.body.innerText") or ""

    name = request.coin.title()
    price = ""
    change_24h = ""
    volume_24h = ""
    market_cap = ""
    all_time_high = ""

    try:
        h1 = page.locator("h1").first
        if h1.is_visible(timeout=2000):
            name = h1.inner_text().strip()
    except Exception:
        pass

    pm = re.search(r"\\$(\\d[\\d,.]*)", body_text)
    if pm:
        price = "$" + pm.group(1)

    chm = re.search(r"([+-]?\\d+\\.?\\d*)%", body_text)
    if chm:
        change_24h = chm.group(0)

    volm = re.search(r"(?:24[hH]?\\s*(?:Trading\\s*)?Volume)[:\\s]*\\$(\\d[\\d,.]*[BKMGT]?)", body_text, re.IGNORECASE)
    if volm:
        volume_24h = "$" + volm.group(1)

    mcm = re.search(r"(?:Market\\s*Cap)[:\\s]*\\$(\\d[\\d,.]*[BKMGT]?)", body_text, re.IGNORECASE)
    if mcm:
        market_cap = "$" + mcm.group(1)

    athm = re.search(r"(?:All.?Time\\s*High)[:\\s]*\\$(\\d[\\d,.]*)", body_text, re.IGNORECASE)
    if athm:
        all_time_high = "$" + athm.group(1)

    result = CoinResult(
        name=name, price=price, change_24h=change_24h,
        volume_24h=volume_24h, market_cap=market_cap,
        all_time_high=all_time_high,
    )

    print("\\n" + "=" * 60)
    print(f"CoinGecko: {result.name}")
    print("=" * 60)
    print(f"  Price:          {result.price}")
    print(f"  24h Change:     {result.change_24h}")
    print(f"  24h Volume:     {result.volume_24h}")
    print(f"  Market Cap:     {result.market_cap}")
    print(f"  All-Time High:  {result.all_time_high}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("coingecko_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = coingecko_search(page, CoinRequest())
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
    const url = `https://www.coingecko.com/en/coins/${CFG.coin}`;
    console.log(`\n🌐 Loading: ${url}...`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url, description: "Navigate to coin page" });

    const coinData = await stagehand.extract(
      "extract the current price, 24h change percentage, 24h trading volume, market cap, and all-time high price"
    );
    console.log("\n📊 Coin:", JSON.stringify(coinData, null, 2));
    recorder.record("extract", { instruction: "Extract coin data", results: coinData });

    const dir = path.join(__dirname);
    fs.writeFileSync(path.join(dir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    console.log(`\n💾 Saved ${recorder.actions.length} actions`);

    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(dir, "coingecko_search.py"), pyCode);
    console.log("🐍 Saved Python script");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
