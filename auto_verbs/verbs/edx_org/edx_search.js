const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient, observeAndAct } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");
const os = require("os");

/**
 * edX.org – Course Search
 *
 * Uses AI-driven discovery to search edx.org for courses,
 * then generates a pure-Playwright Python script.
 * Does not take any screenshots.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  url: "https://www.edx.org",
  query: "data science",
  maxResults: 5,
  waits: { page: 3000, type: 2000, search: 5000 },
};

// ── Python Script Generator ──────────────────────────────────────────────────
function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
edX.org – Course Search
Query: ${cfg.query}

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
    query: str = "${cfg.query}",
    max_results: int = ${cfg.maxResults},
) -> list:
    print(f"  Query: {query}")
    print(f"  Max results: {max_results}\\n")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("edx_org")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        # ── Navigate ──────────────────────────────────────────────────────
        print("Loading edX.org...")
        page.goto("${cfg.url}")
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(3000)

        # ── Dismiss popups / cookie banners ───────────────────────────────
        for selector in [
            "button#onetrust-accept-btn-handler",
            "button:has-text('Accept')",
            "button:has-text('Got it')",
            "button:has-text('Close')",
        ]:
            try:
                btn = page.locator(selector).first
                if btn.is_visible(timeout=1500):
                    btn.evaluate("el => el.click()")
                    page.wait_for_timeout(500)
            except Exception:
                pass

        # ── STEP 1: Search ────────────────────────────────────────────────
        print(f'STEP 1: Search for "{query}"...')
        search_input = page.locator(
            'input[data-testid="search-input"], '
            'input[name="q"], '
            'input[aria-label*="search" i], '
            'input[placeholder*="search" i], '
            'input[type="search"]'
        ).first
        search_input.evaluate("el => el.click()")
        page.wait_for_timeout(500)
        page.keyboard.press("Control+a")
        search_input.type(query, delay=50)
        page.wait_for_timeout(1000)
        page.keyboard.press("Enter")
        print(f'  Typed "{query}" and pressed Enter')
        page.wait_for_timeout(5000)

        # ── STEP 2: Extract courses ───────────────────────────────────────
        print(f"STEP 2: Extract up to {max_results} courses...")

        course_cards = page.locator(
            '[data-testid="course-card"], '
            'div[class*="discovery-card"], '
            'div[class*="course-card"], '
            'article[class*="course"]'
        )
        count = course_cards.count()
        print(f"  Found {count} course cards")

        for i in range(min(count, max_results)):
            card = course_cards.nth(i)
            try:
                title = "N/A"
                institution = "N/A"
                duration = "N/A"

                # Course title
                try:
                    title_el = card.locator('h3, h4, [class*="title"]').first
                    title = title_el.inner_text(timeout=2000).strip()
                except Exception:
                    pass

                # Institution
                try:
                    inst_el = card.locator(
                        '[class*="partner"], [class*="institution"], '
                        '[class*="org"], [class*="school"]'
                    ).first
                    institution = inst_el.inner_text(timeout=2000).strip()
                except Exception:
                    pass

                # Duration
                try:
                    dur_el = card.locator(
                        '[class*="duration"], [class*="length"], '
                        '[class*="weeks"], [class*="effort"]'
                    ).first
                    duration = dur_el.inner_text(timeout=2000).strip()
                except Exception:
                    pass

                if title != "N/A":
                    results.append({
                        "title": title,
                        "institution": institution,
                        "duration": duration,
                    })
                    print(f"  {len(results)}. {title} | {institution} | {duration}")

            except Exception as e:
                print(f"  Error on card {i}: {e}")
                continue

        # ── Print results ─────────────────────────────────────────────────
        print(f"\\nFound {len(results)} courses for '{query}':")
        for i, r in enumerate(results, 1):
            print(f"  {i}. {r['title']}")
            print(f"     Institution: {r['institution']}  Duration: {r['duration']}")

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
        print(f"\\nTotal courses found: {len(items)}")
`;
}

// ── Step Functions ───────────────────────────────────────────────────────────

async function dismissPopups(page) {
  console.log("🔲 Dismissing popups...");
  for (const sel of [
    "button#onetrust-accept-btn-handler",
    "button:has-text('Accept')",
    "button:has-text('Got it')",
    "button:has-text('Close')",
  ]) {
    try {
      const btn = page.locator(sel);
      if (await btn.isVisible({ timeout: 1500 })) {
        await btn.click();
        console.log(`   ✅ Dismissed: ${sel}`);
      }
    } catch (e) { /* no popup */ }
  }
  await page.waitForTimeout(500);
}

async function searchCourses(stagehand, page, recorder, query) {
  console.log(`🎯 STEP 1: Search for "${query}"...`);

  await observeAndAct(stagehand, page, recorder,
    `Click the search input field`,
    "Click search input"
  );
  await page.waitForTimeout(500);

  await stagehand.act(`Clear the search field and type '${query}'`);
  console.log(`   ✅ Typed "${query}"`);
  recorder.record("act", {
    instruction: `Type '${query}' into search`,
    description: `Fill search: ${query}`,
    method: "type",
  });
  await page.waitForTimeout(CFG.waits.type);

  await stagehand.act("Press Enter to search");
  console.log("   ✅ Pressed Enter");
  recorder.record("act", {
    instruction: "Press Enter to search",
    description: "Submit search",
    method: "press",
  });

  await page.waitForTimeout(CFG.waits.search);
  await page.waitForLoadState("domcontentloaded");
  console.log(`   📍 URL: ${page.url()}`);
}

async function extractCourses(stagehand, page, recorder) {
  console.log(`🎯 STEP 2: Extract up to ${CFG.maxResults} courses...\n`);
  const { z } = require("zod/v3");

  const listings = await stagehand.extract(
    `Extract up to ${CFG.maxResults} course search results from this page. For each course, get the course title, institution/partner name, and duration (e.g. "8 weeks"). Only real course results, not ads.`,
    z.object({
      courses: z.array(z.object({
        title: z.string().describe("Course title"),
        institution: z.string().describe("Institution or partner name"),
        duration: z.string().describe("Course duration, e.g. '8 weeks'"),
      })).describe(`Up to ${CFG.maxResults} courses`),
    })
  );

  recorder.record("extract", {
    instruction: "Extract course search results",
    description: `Extract up to ${CFG.maxResults} courses`,
    results: listings,
  });

  console.log(`📋 Found ${listings.courses.length} courses:`);
  listings.courses.forEach((r, i) => {
    console.log(`   ${i + 1}. ${r.title}`);
    console.log(`      🏫 ${r.institution}  ⏱️ ${r.duration}`);
  });

  return listings;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  edX.org – Course Search");
  console.log("  🔍 AI-driven discovery + Playwright locators");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  🎓 Query: "${CFG.query}"`);
  console.log(`  📋 Max results: ${CFG.maxResults}\n`);

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
        args: ["--disable-blink-features=AutomationControlled", "--disable-infobars", "--disable-extensions", "--start-maximized", "--window-size=1920,1080"],
      },
    });
    await stagehand.init();
    console.log("✅ Stagehand ready\n");

    const page = stagehand.context.pages()[0];

    // Navigate
    console.log("🌐 Loading edX.org...");
    recorder.goto(CFG.url);
    await page.goto(CFG.url);
    await page.waitForLoadState("domcontentloaded");
    console.log("✅ Loaded\n");
    recorder.wait(CFG.waits.page, "Initial page load");
    await page.waitForTimeout(CFG.waits.page);

    await dismissPopups(page);
    await searchCourses(stagehand, page, recorder, CFG.query);

    const listings = await extractCourses(stagehand, page, recorder);

    console.log("\n═══════════════════════════════════════════════════════════");
    console.log(`  ✅ DONE — ${listings.courses.length} courses found`);
    console.log("═══════════════════════════════════════════════════════════");
    listings.courses.forEach((r, i) => {
      console.log(`  ${i + 1}. ${r.title} — ${r.institution}  Duration: ${r.duration}`);
    });

    // Save Python + JSON
    const pyScript = genPython(CFG, recorder);
    const pyPath = path.join(__dirname, "edx_search.py");
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
      fs.writeFileSync(path.join(__dirname, "edx_search.py"), pyScript, "utf-8");
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
