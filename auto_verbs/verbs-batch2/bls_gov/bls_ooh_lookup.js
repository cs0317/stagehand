const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient, observeAndAct } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");
const os = require("os");

/**
 * BLS.gov – Occupational Outlook Handbook Lookup
 *
 * Uses AI-driven discovery to search the BLS OOH for an occupation
 * and extract key facts (median pay, job outlook, entry-level education).
 * Records interactions and generates a Python Playwright script.
 */

const CFG = {
  url: "https://www.bls.gov/ooh/",
  occupation: "software developer",
  waits: { page: 3000, type: 2000, search: 5000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
BLS.gov – Occupational Outlook Handbook Lookup
Occupation: ${cfg.occupation}

Generated on: ${ts}
Recorded ${n} browser interactions

Uses Playwright via CDP connection with the user's Chrome profile.
"""

import re
import os, sys, shutil
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws


def run(
    playwright: Playwright,
    occupation: str = "${cfg.occupation}",
) -> dict:
    print(f"  Occupation: {occupation}\\n")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("bls_gov")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    result = {"occupation": occupation, "median_pay": "N/A", "job_outlook": "N/A", "entry_level_education": "N/A"}

    try:
        # ── Navigate to OOH ──────────────────────────────────────────────
        print("Loading BLS Occupational Outlook Handbook...")
        page.goto("${cfg.url}")
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(2000)

        # ── STEP 1: Search for occupation ─────────────────────────────────
        print(f'STEP 1: Search for "{occupation}"...')
        search_input = page.locator(
            '#search-ooh, '
            'input[name="q"], '
            'input[aria-label*="search" i], '
            'input[placeholder*="search" i], '
            '#ooh-search'
        ).first
        search_input.evaluate("el => el.click()")
        page.wait_for_timeout(500)
        page.keyboard.press("Control+a")
        search_input.type(occupation, delay=50)
        page.wait_for_timeout(1000)
        page.keyboard.press("Enter")
        print(f'  Typed "{occupation}" and pressed Enter')
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(2000)

        # ── STEP 2: Click the first matching result ───────────────────────
        print("STEP 2: Click the first search result...")
        first_link = page.locator(
            '#search-results a, '
            '.search-results a, '
            'a[href*="/ooh/"]'
        ).first
        try:
            first_link.wait_for(state="visible", timeout=5000)
            href = first_link.get_attribute("href")
            link_text = first_link.inner_text(timeout=2000).strip()
            print(f'  Found: "{link_text}"')
            if href and not href.startswith("http"):
                href = f"https://www.bls.gov{href}"
            page.goto(href)
        except Exception:
            first_link.evaluate("el => el.click()")
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(2000)

        # ── STEP 3: Extract key facts ─────────────────────────────────────
        print("STEP 3: Extract median pay, job outlook, entry-level education...")

        body_text = page.locator("body").inner_text(timeout=10000)

        # Median pay
        mp = re.search(
            r"(?:Median Pay|Median Annual Wage|20\\d{2} Median Pay)[:\\s]*\\$?([\\d,]+(?:\\s*per\\s*\\w+)?)",
            body_text, re.IGNORECASE,
        )
        if mp:
            result["median_pay"] = mp.group(0).strip()

        # Job outlook
        jo = re.search(
            r"(?:Job Outlook|Employment Change)[,:\\s]*(\\d+[\\s\\S]{0,80}?(?:percent|%|growth|decline|change))",
            body_text, re.IGNORECASE,
        )
        if jo:
            result["job_outlook"] = jo.group(0).strip()
        else:
            jo2 = re.search(
                r"(?:much faster|faster|as fast as|slower|decline)\\s+than\\s+(?:the\\s+)?average",
                body_text, re.IGNORECASE,
            )
            if jo2:
                result["job_outlook"] = jo2.group(0).strip()

        # Entry-level education
        edu = re.search(
            r"(?:Entry[- ]Level Education|Typical Entry[- ]Level Education)[:\\s]*([^\\n]+)",
            body_text, re.IGNORECASE,
        )
        if edu:
            result["entry_level_education"] = edu.group(1).strip()

        # ── Fallback: try the quick-facts table ──────────────────────────
        if result["median_pay"] == "N/A" or result["entry_level_education"] == "N/A":
            try:
                table = page.locator('#702702, table.ooh-table, .quickfacts').first
                table_text = table.inner_text(timeout=3000)

                if result["median_pay"] == "N/A":
                    mp2 = re.search(r"\\$[\\d,]+(?:\\s*per\\s*\\w+)?", table_text)
                    if mp2:
                        result["median_pay"] = mp2.group(0).strip()

                if result["entry_level_education"] == "N/A":
                    edu2 = re.search(r"(?:Bachelor|Master|Associate|Doctoral|High school)[^\\n]*", table_text, re.IGNORECASE)
                    if edu2:
                        result["entry_level_education"] = edu2.group(0).strip()
            except Exception:
                pass

        # ── Print results ─────────────────────────────────────────────────
        print(f"\\nResults for '{occupation}':")
        print(f"  Median Pay:            {result['median_pay']}")
        print(f"  Job Outlook:           {result['job_outlook']}")
        print(f"  Entry-Level Education: {result['entry_level_education']}")

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
        info = run(playwright)
        print(f"\\n--- Summary ---")
        for k, v in info.items():
            print(f"  {k}: {v}")
`;
}

// ── Step Functions ───────────────────────────────────────────────────────────

async function searchOccupation(stagehand, page, recorder, occupation) {
  console.log(`🎯 STEP 1: Search for "${occupation}"...`);

  await observeAndAct(stagehand, page, recorder,
    `Click the search input field on the OOH page`,
    "Click search input"
  );
  await page.waitForTimeout(500);

  await stagehand.act(`Clear the search field and type '${occupation}'`);
  console.log(`   ✅ Typed "${occupation}"`);
  recorder.record("act", {
    instruction: `Type '${occupation}' into search`,
    description: `Fill search: ${occupation}`,
    method: "type",
  });
  await page.waitForTimeout(CFG.waits.type);

  await stagehand.act("Press Enter to search");
  console.log("   ✅ Pressed Enter");
  await page.waitForTimeout(CFG.waits.search);
  await page.waitForLoadState("domcontentloaded");
}

async function clickFirstResult(stagehand, page, recorder) {
  console.log("🎯 STEP 2: Click the first search result...");

  await observeAndAct(stagehand, page, recorder,
    `Click the first occupation search result link`,
    "Click first result"
  );
  console.log("   ✅ Clicked first result");
  await page.waitForTimeout(CFG.waits.search);
  await page.waitForLoadState("domcontentloaded");
}

async function extractFacts(stagehand, page, recorder) {
  console.log("🎯 STEP 3: Extract occupation facts...\n");
  const { z } = require("zod/v3");

  const facts = await stagehand.extract(
    `Extract the following facts about this occupation from the page: median pay (annual salary), job outlook (growth rate and description), and entry-level education requirement.`,
    z.object({
      medianPay: z.string().describe("Median annual pay, e.g. '$132,270 per year'"),
      jobOutlook: z.string().describe("Job outlook, e.g. '25 percent (much faster than average)'"),
      entryLevelEducation: z.string().describe("Entry-level education, e.g. 'Bachelor\\'s degree'"),
    })
  );

  recorder.record("extract", {
    instruction: "Extract occupation facts",
    description: "Extract median pay, job outlook, education",
    results: facts,
  });

  console.log(`📋 Results:`);
  console.log(`   💰 Median Pay: ${facts.medianPay}`);
  console.log(`   📈 Job Outlook: ${facts.jobOutlook}`);
  console.log(`   🎓 Education: ${facts.entryLevelEducation}`);

  return facts;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  BLS.gov – Occupational Outlook Handbook");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  🔎 Occupation: "${CFG.occupation}"\n`);

  const recorder = new PlaywrightRecorder();
  const llmClient = setupLLMClient("hybrid");
  let stagehand;

  try {
    console.log("🎭 Initializing Stagehand...");
    stagehand = new Stagehand({
      env: "LOCAL",
      verbose: 0,
      llmClient,
      localBrowserLaunchOptions: {
        userDataDir: path.join(os.homedir(), "AppData", "Local", "Google", "Chrome", "User Data", "Default"),
        headless: false,
        viewport: { width: 1920, height: 1080 },
        args: ["--disable-blink-features=AutomationControlled", "--disable-infobars", "--disable-extensions", "--start-maximized"],
      },
    });
    await stagehand.init();
    console.log("✅ Stagehand ready\n");

    const page = stagehand.context.pages()[0];

    console.log("🌐 Loading BLS OOH...");
    recorder.goto(CFG.url);
    await page.goto(CFG.url);
    await page.waitForLoadState("domcontentloaded");
    console.log("✅ Loaded\n");
    await page.waitForTimeout(CFG.waits.page);

    await searchOccupation(stagehand, page, recorder, CFG.occupation);
    await clickFirstResult(stagehand, page, recorder);
    const facts = await extractFacts(stagehand, page, recorder);

    console.log("\n═══════════════════════════════════════════════════════════");
    console.log(`  ✅ DONE`);
    console.log("═══════════════════════════════════════════════════════════");

    const pyScript = genPython(CFG, recorder);
    const pyPath = path.join(__dirname, "bls_ooh_lookup.py");
    fs.writeFileSync(pyPath, pyScript, "utf-8");
    console.log(`\n✅ Python: ${pyPath}`);

    const jsonPath = path.join(__dirname, "recorded_actions.json");
    fs.writeFileSync(jsonPath, JSON.stringify(recorder.actions, null, 2), "utf-8");
    console.log(`📋 Actions: ${jsonPath}`);

    return facts;

  } catch (err) {
    console.error("\n❌ Error:", err.message);
    if (recorder?.actions.length > 0) {
      const pyScript = genPython(CFG, recorder);
      fs.writeFileSync(path.join(__dirname, "bls_ooh_lookup.py"), pyScript, "utf-8");
      console.log("⚠️  Partial Python saved");
    }
    throw err;
  } finally {
    if (stagehand) {
      console.log("🧹 Closing...");
      await stagehand.close();
    }
  }
}

if (require.main === module) {
  main().then(() => { console.log("🎊 Done!"); process.exit(0); }).catch((e) => { console.error("💥", e.message); process.exit(1); });
}
module.exports = { main };
