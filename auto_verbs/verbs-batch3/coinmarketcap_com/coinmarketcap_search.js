/**
 * coinmarketcap_search.js – Stagehand explorer for CoinMarketCap
 *
 * Run:
 *   node verbs/coinmarketcap_com/coinmarketcap_search.js
 */

const { Stagehand } = require("@browserbasehq/stagehand");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");
const {
  PlaywrightRecorder,
  setupLLMClient,
} = require("../../stagehand-utils");

// ── Configurable parameters ──────────────────────────────────────────
const QUERY = "Bitcoin";

// ── Python generation ────────────────────────────────────────────────
function genPython() {
  return `\
"""
Auto-generated Playwright script (Python)
CoinMarketCap – Crypto Price Lookup
Query: ${QUERY}

Generated on: ${new Date().toISOString()}
"""

import re
import os, sys, shutil
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws


def run(
    playwright: Playwright,
    query: str = "${QUERY}",
) -> dict:
    print(f"  Query: {query}\\n")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("coinmarketcap_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    result = {}

    try:
        # ── Navigate ──────────────────────────────────────────────────
        print("Loading CoinMarketCap...")
        slug = query.lower().replace(" ", "-")
        page.goto(f"https://coinmarketcap.com/currencies/{slug}/")
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(5000)
        print(f"  Loaded: {page.url}")

        # ── Extract crypto data ───────────────────────────────────────
        print("Extracting crypto data...")

        body_text = page.evaluate("document.body.innerText") or ""
        lines = [l.strip() for l in body_text.split("\\n") if l.strip()]

        price = "N/A"
        change_24h = "N/A"
        market_cap = "N/A"
        volume_24h = "N/A"

        for i, line in enumerate(lines):
            # Price: "$XX,XXX.XX" pattern (large number with decimals)
            if price == "N/A" and re.match(r"^\\$[\\d,]+\\.\\d{2}$", line):
                price = line

            # 24h change: "X.XX% (24h)" pattern
            if "(24h)" in line and "%" in line:
                m = re.search(r"([\\-\\d.]+)%\\s*\\(24h\\)", line)
                if m:
                    change_24h = m.group(1) + "%"

            # Market cap
            if line == "Market cap" and i + 1 < len(lines):
                market_cap = lines[i + 1]

            # Volume (24h)
            if "Volume (24h)" in line and i + 1 < len(lines):
                volume_24h = lines[i + 1]

        result = {
            "name": query,
            "price": price,
            "change_24h": change_24h,
            "market_cap": market_cap,
            "volume_24h": volume_24h,
        }

        # ── Print results ─────────────────────────────────────────────
        print(f"\\n{result['name']}:")
        print(f"  Current Price:    {result['price']}")
        print(f"  24h Change:       {result['change_24h']}")
        print(f"  Market Cap:       {result['market_cap']}")
        print(f"  24h Volume:       {result['volume_24h']}")

    except Exception as e:
        import traceback
        print(f"Error: {e}")
        traceback.print_exc()
    finally:
        try:
            browser.close()
        except Exception:
            pass
        chrome_proc.terminate()
        shutil.rmtree(profile_dir, ignore_errors=True)

    return result


if __name__ == "__main__":
    with sync_playwright() as playwright:
        run(playwright)
`;
}

// ── Main ─────────────────────────────────────────────────────────────
(async () => {
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  CoinMarketCap – Crypto Price Lookup");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  🪙 Query: " + QUERY);

  const llmClient = setupLLMClient("hybrid");
  const stagehand = new Stagehand({ env: "LOCAL", verbose: 0, llmClient });
  await stagehand.init();

  const page = stagehand.context.pages()[0];
  const recorder = new PlaywrightRecorder();

  const slug = QUERY.toLowerCase().replace(/ /g, "-");
  const url = "https://coinmarketcap.com/currencies/" + slug + "/";
  console.log("\n🌐 Loading " + url + "...");
  await page.goto(url);
  await page.waitForLoadState("domcontentloaded");
  await new Promise((r) => setTimeout(r, 5000));
  recorder.record("goto", "Navigate to " + url, { url });
  console.log("✅ Loaded\n");

  // ── Extract with AI ───────────────────────────────────────────────
  const CryptoSchema = z.object({
    price: z.string(),
    change_24h: z.string(),
    market_cap: z.string(),
    volume_24h: z.string(),
  });

  const data = await stagehand.extract(
    "Extract Bitcoin's current price, 24h change percentage, market cap, and 24h trading volume.",
    CryptoSchema
  );
  recorder.record("extract", "Extract crypto data");

  console.log("📋 " + QUERY + ":");
  console.log("   Price:      " + data.price);
  console.log("   24h Change: " + data.change_24h);
  console.log("   Market Cap: " + data.market_cap);
  console.log("   24h Volume: " + data.volume_24h);

  // ── Save Python & actions ─────────────────────────────────────────
  const pyPath = path.join(__dirname, "coinmarketcap_search.py");
  fs.writeFileSync(pyPath, genPython(), "utf-8");
  console.log("\n✅ Python: " + pyPath);

  const actionsPath = path.join(__dirname, "recorded_actions.json");
  fs.writeFileSync(actionsPath, JSON.stringify(recorder.actions, null, 2), "utf-8");
  console.log("📋 Actions: " + actionsPath);

  await stagehand.close();
  console.log("🎊 Done!");
})();
