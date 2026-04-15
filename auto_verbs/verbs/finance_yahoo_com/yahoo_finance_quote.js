const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Yahoo Finance – Stock Quote Extraction
 *
 * Navigates to Yahoo Finance quote page for a given stock symbol.
 * Extracts current price, day change, volume, and market cap.
 */

const CFG = {
  baseUrl: "https://finance.yahoo.com/quote",
  symbol: "AAPL",
  waits: { page: 8000, action: 2000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  const lines = [];
  lines.push('"""');
  lines.push("Auto-generated Playwright script (Python)");
  lines.push("Yahoo Finance - Stock Quote Extraction");
  lines.push("Symbol: " + cfg.symbol);
  lines.push("");
  lines.push("Generated on: " + ts);
  lines.push("Recorded " + n + " browser interactions");
  lines.push('"""');
  lines.push("");
  lines.push("import re");
  lines.push("import os, sys, shutil");
  lines.push("from playwright.sync_api import Playwright, sync_playwright");
  lines.push("");
  lines.push('sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))');
  lines.push("from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws");
  lines.push("");
  lines.push("");
  lines.push("def run(");
  lines.push("    playwright: Playwright,");
  lines.push('    symbol: str = "' + cfg.symbol + '",');
  lines.push(") -> dict:");
  lines.push('    print(f"  Symbol: {symbol}\\n")');
  lines.push("");
  lines.push("    port = get_free_port()");
  lines.push('    profile_dir = get_temp_profile_dir("finance_yahoo_com")');
  lines.push("    chrome_proc = launch_chrome(profile_dir, port)");
  lines.push("    ws_url = wait_for_cdp_ws(port)");
  lines.push("    browser = playwright.chromium.connect_over_cdp(ws_url)");
  lines.push("    context = browser.contexts[0]");
  lines.push("    page = context.pages[0] if context.pages else context.new_page()");
  lines.push("    result = {}");
  lines.push("");
  lines.push("    try:");
  lines.push('        url = f"' + cfg.baseUrl + '/{symbol}/"');
  lines.push('        print(f"Loading {url}...")');
  lines.push("        page.goto(url)");
  lines.push('        page.wait_for_load_state("domcontentloaded")');
  lines.push("        page.wait_for_timeout(8000)");
  lines.push('        print(f"  Loaded: {page.url}")');
  lines.push("");
  lines.push("        text = page.evaluate(\"document.body ? document.body.innerText : ''\") or \"\"");
  lines.push('        lines = [l.strip() for l in text.split("\\n") if l.strip()]');
  lines.push("");
  lines.push("        # Find the stock name line containing the symbol in parentheses");
  lines.push("        stock_name = symbol");
  lines.push("        price = \"N/A\"");
  lines.push("        change_amount = \"N/A\"");
  lines.push("        change_pct = \"N/A\"");
  lines.push("        volume = \"N/A\"");
  lines.push("        market_cap = \"N/A\"");
  lines.push("");
  lines.push("        for i, line in enumerate(lines):");
  lines.push("            # Find stock name and price");
  lines.push('            if f"({symbol})" in line and len(line) < 60:');
  lines.push("                stock_name = line");
  lines.push("                # Next line is the current price");
  lines.push("                if i + 1 < len(lines):");
  lines.push("                    price_candidate = lines[i + 1]");
  lines.push('                    if re.match(r"^[\\d,.]+$", price_candidate):');
  lines.push("                        price = price_candidate");
  lines.push("                # Day change amount (starts with + or -)");
  lines.push("                if i + 2 < len(lines):");
  lines.push("                    chg = lines[i + 2]");
  lines.push('                    if re.match(r"^[+-]", chg):');
  lines.push("                        change_amount = chg");
  lines.push("                # Day change percentage");
  lines.push("                if i + 3 < len(lines):");
  lines.push("                    pct = lines[i + 3]");
  lines.push('                    if pct.startswith("(") and "%" in pct:');
  lines.push("                        change_pct = pct");
  lines.push("");
  lines.push("            # Find volume");
  lines.push('            if line == "Volume" and i + 1 < len(lines):');
  lines.push("                volume = lines[i + 1]");
  lines.push("");
  lines.push("            # Find market cap");
  lines.push('            if "Market Cap" in line and i + 1 < len(lines):');
  lines.push("                market_cap = lines[i + 1]");
  lines.push("");
  lines.push("        result = {");
  lines.push('            "name": stock_name,');
  lines.push('            "price": price,');
  lines.push('            "change": change_amount + " " + change_pct,');
  lines.push('            "volume": volume,');
  lines.push('            "market_cap": market_cap,');
  lines.push("        }");
  lines.push("");
  lines.push('        print("=" * 50)');
  lines.push('        print(f"Stock Quote: {stock_name}")');
  lines.push('        print("=" * 50)');
  lines.push('        print(f"  Current Price: ${price}")');
  lines.push('        print(f"  Day Change:    {change_amount} {change_pct}")');
  lines.push('        print(f"  Volume:        {volume}")');
  lines.push('        print(f"  Market Cap:    {market_cap}")');
  lines.push("");
  lines.push("    except Exception as e:");
  lines.push('        print(f"Error: {e}")');
  lines.push("        import traceback");
  lines.push("        traceback.print_exc()");
  lines.push("    finally:");
  lines.push("        browser.close()");
  lines.push("        chrome_proc.terminate()");
  lines.push("        shutil.rmtree(profile_dir, ignore_errors=True)");
  lines.push("");
  lines.push("    return result");
  lines.push("");
  lines.push("");
  lines.push('if __name__ == "__main__":');
  lines.push("    with sync_playwright() as pw:");
  lines.push("        run(pw)");
  return lines.join("\n");
}

// ── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  const llmClient = setupLLMClient("hybrid");
  const stagehand = new Stagehand({
    env: "LOCAL",
    verbose: 0,
    llmClient,
  });
  await stagehand.init();
  const page = stagehand.context.pages()[0];
  const recorder = new PlaywrightRecorder();

  try {
    const url = CFG.baseUrl + "/" + CFG.symbol + "/";
    console.log("Loading " + url + "...");
    recorder.record("page.goto", { url });
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await new Promise(r => setTimeout(r, CFG.waits.page));
    console.log("  URL:", page.url());

    // Dismiss cookie/consent if present
    try {
      await stagehand.act("click Accept All or Agree button if visible");
      recorder.record("click", { selector: 'button:has-text("Accept All")' });
      await new Promise(r => setTimeout(r, CFG.waits.action));
    } catch(e) {}

    // Parse text for stock data
    const text = await page.evaluate(() => document.body ? document.body.innerText : "");
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

    let stockName = CFG.symbol;
    let price = "N/A";
    let changeAmount = "N/A";
    let changePct = "N/A";
    let volume = "N/A";
    let marketCap = "N/A";

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Find stock name line — should be short and end with "(SYMBOL)"
      if (line.includes("(" + CFG.symbol + ")") && line.length < 60) {
        stockName = line;
        if (i + 1 < lines.length && /^[\d,.]+$/.test(lines[i + 1])) {
          price = lines[i + 1];
        }
        if (i + 2 < lines.length && /^[+-]/.test(lines[i + 2])) {
          changeAmount = lines[i + 2];
        }
        if (i + 3 < lines.length && lines[i + 3].startsWith("(") && lines[i + 3].includes("%")) {
          changePct = lines[i + 3];
        }
      }
      if (line === "Volume" && i + 1 < lines.length) {
        volume = lines[i + 1];
      }
      if (line.includes("Market Cap") && i + 1 < lines.length) {
        marketCap = lines[i + 1];
      }
    }

    console.log("\n" + "=".repeat(50));
    console.log("Stock Quote: " + stockName);
    console.log("=".repeat(50));
    console.log("  Current Price: $" + price);
    console.log("  Day Change:    " + changeAmount + " " + changePct);
    console.log("  Volume:        " + volume);
    console.log("  Market Cap:    " + marketCap);

    // Generate Python
    const pyCode = genPython(CFG, recorder);
    const pyPath = path.join(__dirname, "yahoo_finance_quote.py");
    fs.writeFileSync(pyPath, pyCode);
    console.log("\nPython script written to:", pyPath);

  } catch(e) {
    console.error("Error:", e.message);
  } finally {
    await stagehand.close();
  }
})();
