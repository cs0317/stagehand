const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Bankrate.com – Best Savings Rates
 */

const CFG = {
  url: "https://www.bankrate.com/banking/savings/best-high-yield-interests-savings-accounts/",
  maxResults: 5,
  waits: { page: 5000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Bankrate.com – Best Savings Rates
Max results: ${cfg.maxResults}

Generated on: ${ts}
Recorded ${n} browser interactions
"""

import re
import os, sys, shutil
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws


def run(
    playwright: Playwright,
    max_results: int = ${cfg.maxResults},
) -> list:
    print(f"  Max results: {max_results}\\n")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("bankrate_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        # ── Navigate ──────────────────────────────────────────────────────
        print("Loading Bankrate best savings rates page...")
        page.goto("${cfg.url}")
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(5000)
        print(f"  Loaded: {page.url}")

        # ── Extract savings accounts ──────────────────────────────────────
        print(f"Extracting up to {max_results} savings accounts...")

        # Parse page text for savings account data
        body_text = page.evaluate("document.body.innerText") or ""
        lines = [l.strip() for l in body_text.split("\\n") if l.strip()]

        i = 0
        while i < len(lines) and len(results) < max_results:
            line = lines[i]

            # Look for "APY as of" pattern which marks a savings account entry
            if "APY as of" in line:
                # APY is typically on the next line as "X.XX" then "%" 
                apy = "N/A"
                for k in range(i + 1, min(i + 4, len(lines))):
                    m = re.match(r"^(\\d+\\.\\d+)$", lines[k])
                    if m:
                        apy = m.group(1) + "%"
                        break

                # Min balance: look for "Min. balance for APY" then "$" then amount
                min_deposit = "N/A"
                for k in range(i, min(i + 10, len(lines))):
                    if "Min. balance for APY" in lines[k]:
                        for j2 in range(k + 1, min(k + 4, len(lines))):
                            if lines[j2] == "$":
                                if j2 + 1 < len(lines):
                                    min_deposit = "$" + lines[j2 + 1].replace(",", "")
                                break
                        break

                # Bank name: search backward for the bank name
                bank_name = "N/A"
                for k in range(max(0, i - 8), i):
                    candidate = lines[k]
                    # Bank names usually contain specific keywords
                    if (len(candidate) > 5
                        and not candidate.startswith("Add")
                        and "FDIC" not in candidate
                        and "Bankrate" not in candidate
                        and "score" not in candidate.lower()
                        and "compare" not in candidate.lower()
                        and "EDITOR" not in candidate
                        and "LIMITED" not in candidate
                        and "Offer expires" not in candidate
                        and "Member" not in candidate
                        and re.search(r"[A-Z]", candidate)):
                        # Check if this looks like a bank name (contains words like Bank, Savings, etc.)
                        if (re.search(r"(bank|savings|account|credit|capital|cit|cash|ally|discover|marcus|american|barclays|synchrony|sofi|wealthfront|betterment|bread|ufb|vio|popular direct|citibank|live oak)", candidate, re.IGNORECASE)
                            or len(candidate.split()) <= 6):
                            bank_name = candidate

                if bank_name != "N/A" and apy != "N/A":
                    results.append({
                        "bank_name": bank_name,
                        "apy": apy,
                        "min_deposit": min_deposit,
                    })

            i += 1

        # ── Print results ─────────────────────────────────────────────────
        print(f"\\nFound {len(results)} savings account offers:\\n")
        for i, offer in enumerate(results, 1):
            print(f"  {i}. {offer['bank_name']}")
            print(f"     APY: {offer['apy']}  Min deposit: {offer['min_deposit']}")
            print()

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

    return results


if __name__ == "__main__":
    with sync_playwright() as playwright:
        items = run(playwright)
        print(f"\\nTotal offers found: {len(items)}")
`;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Bankrate.com – Best Savings Rates");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  📊 Max results: ${CFG.maxResults}\n`);

  const recorder = new PlaywrightRecorder();
  const llmClient = setupLLMClient("hybrid");
  let stagehand;

  try {
    stagehand = new Stagehand({
      env: "LOCAL", verbose: 0, llmClient,
      localBrowserLaunchOptions: {
        headless: false,
        viewport: { width: 1920, height: 1080 },
        args: ["--disable-blink-features=AutomationControlled", "--start-maximized"],
      },
    });
    await stagehand.init();
    const page = stagehand.context.pages()[0];

    console.log("🌐 Loading Bankrate best savings rates page...");
    recorder.goto(CFG.url);
    await page.goto(CFG.url);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(CFG.waits.page);
    console.log("✅ Loaded\n");

    const { z } = require("zod/v3");
    const listings = await stagehand.extract(
      `Extract up to ${CFG.maxResults} savings account offers from this page. For each, get the bank name, APY percentage, and minimum deposit amount.`,
      z.object({
        accounts: z.array(z.object({
          bankName: z.string().describe("Bank/institution name"),
          apy: z.string().describe("APY percentage, e.g. '4.21%'"),
          minDeposit: z.string().describe("Minimum deposit, e.g. '$0' or '$5,000'"),
        })).describe(`Up to ${CFG.maxResults} savings accounts`),
      })
    );

    recorder.record("extract", {
      instruction: "Extract savings account offers",
      description: `Extract up to ${CFG.maxResults} savings accounts`,
      results: listings,
    });

    console.log(`📋 Found ${listings.accounts.length} savings accounts:`);
    listings.accounts.forEach((a, i) => {
      console.log(`   ${i + 1}. ${a.bankName}`);
      console.log(`      APY: ${a.apy}  Min deposit: ${a.minDeposit}`);
    });

    const pyScript = genPython(CFG, recorder);
    const pyPath = path.join(__dirname, "bankrate_savings.py");
    fs.writeFileSync(pyPath, pyScript, "utf-8");
    console.log(`\n✅ Python: ${pyPath}`);

    const jsonPath = path.join(__dirname, "recorded_actions.json");
    fs.writeFileSync(jsonPath, JSON.stringify(recorder.actions, null, 2), "utf-8");
    console.log(`📋 Actions: ${jsonPath}`);

    return listings;
  } catch (err) {
    console.error("\n❌ Error:", err.message);
    if (recorder?.actions.length > 0) {
      const pyScript = genPython(CFG, recorder);
      fs.writeFileSync(path.join(__dirname, "bankrate_savings.py"), pyScript, "utf-8");
    }
    throw err;
  } finally {
    if (stagehand) await stagehand.close();
  }
}

if (require.main === module) {
  main().then(() => { console.log("🎊 Done!"); process.exit(0); }).catch((e) => { console.error("💥", e.message); process.exit(1); });
}
module.exports = { main };
