/**
 * bbb_search.js – Stagehand explorer for BBB.org
 *
 * Run:
 *   node verbs/bbb_org/bbb_search.js
 */

const { Stagehand } = require("@browserbasehq/stagehand");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");
const {
  PlaywrightRecorder,
  setupLLMClient,
  observeAndAct,
} = require("../../stagehand-utils");

// ── Configurable parameters ──────────────────────────────────────────
const QUERY = "Comcast";

// ── Python generation ────────────────────────────────────────────────
function genPython() {
  return `\
"""
Auto-generated Playwright script (Python)
BBB.org – Business Profile Search
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
    profile_dir = get_temp_profile_dir("bbb_org")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    result = {}

    try:
        # ── Navigate to BBB and search ────────────────────────────────
        print("Searching BBB.org...")
        page.goto("https://www.bbb.org")
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(3000)

        # Type query into search box
        search_input = page.locator("input[placeholder*='Find']").first
        search_input.fill(query)
        page.wait_for_timeout(500)

        # Click Search button
        search_btn = page.locator("button:has-text('Search'), button[type='submit']").first
        search_btn.click()
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(5000)
        print(f"  Search results: {page.url}")

        # Click first business result link
        first_result = page.locator("a[href*='/profile/']").first
        first_result.click()
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(5000)
        print(f"  Profile page: {page.url}")

        # ── Extract from MAIN tab ────────────────────────────────────
        body_text = page.evaluate("document.body.innerText") or ""
        lines = [l.strip() for l in body_text.split("\\n") if l.strip()]

        # Business name
        business_name = query
        for i, line in enumerate(lines):
            if "BUSINESS PROFILE" in line and i + 2 < len(lines):
                business_name = lines[i + 2]
                break

        # BBB Rating
        bbb_rating = "N/A"
        for i, line in enumerate(lines):
            if line == "BBB Rating" and i + 1 < len(lines):
                bbb_rating = lines[i + 1]
                break

        # Accreditation
        accredited = "N/A"
        for line in lines:
            if "NOT BBB Accredited" in line or "NOT a BBB Accredited" in line:
                accredited = "Not Accredited"
                break
            elif "BBB Accredited" in line and "NOT" not in line and "Find" not in line and "become" not in line.lower():
                accredited = "Accredited"
                break
        if accredited == "N/A":
            for line in lines:
                if "is NOT a BBB Accredited" in line:
                    accredited = "Not Accredited"
                    break
                elif "is a BBB Accredited" in line:
                    accredited = "Accredited"
                    break

        # ── Navigate to Reviews tab ───────────────────────────────────
        review_rating = "N/A"
        review_count = "N/A"
        try:
            reviews_link = page.locator("a[href*='/customer-reviews'], a:has-text('REVIEWS')").first
            reviews_link.click()
            page.wait_for_load_state("networkidle")
            page.wait_for_timeout(3000)

            review_text = page.evaluate("document.body.innerText") or ""
            review_lines = [l.strip() for l in review_text.split("\\n") if l.strip()]

            for i, line in enumerate(review_lines):
                if "Customer Review Ratings" in line:
                    # Next line should be the rating number
                    if i + 1 < len(review_lines):
                        m = re.match(r"^(\\d+\\.\\d+)$", review_lines[i + 1])
                        if m:
                            review_rating = m.group(1) + "/5"
                    break

            for line in review_lines:
                m = re.search(r"Average of ([\\d,]+) Customer Reviews", line)
                if m:
                    review_count = m.group(1)
                    break
        except Exception:
            pass

        # ── Navigate to Complaints tab ────────────────────────────────
        total_complaints = "N/A"
        try:
            page.go_back()
            page.wait_for_load_state("networkidle")
            page.wait_for_timeout(2000)
            complaints_link = page.locator("a[href*='/complaints'], a:has-text('COMPLAINTS')").first
            complaints_link.click()
            page.wait_for_load_state("networkidle")
            page.wait_for_timeout(3000)

            complaint_text = page.evaluate("document.body.innerText") or ""
            for line in complaint_text.split("\\n"):
                m = re.search(r"([\\d,]+) total complaints", line)
                if m:
                    total_complaints = m.group(1)
                    break
        except Exception:
            pass

        result = {
            "business_name": business_name,
            "bbb_rating": bbb_rating,
            "accreditation": accredited,
            "customer_review_rating": review_rating,
            "review_count": review_count,
            "total_complaints": total_complaints,
        }

        # ── Print results ─────────────────────────────────────────────
        print(f"\\nBBB Profile for {result['business_name']}:\\n")
        print(f"  BBB Rating:            {result['bbb_rating']}")
        print(f"  Accreditation:         {result['accreditation']}")
        print(f"  Customer Review Rating: {result['customer_review_rating']}")
        print(f"  Number of Reviews:     {result['review_count']}")
        print(f"  Total Complaints:      {result['total_complaints']}")

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
  console.log("  BBB.org – Business Profile Search");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  🔍 Query: " + QUERY);

  const llmClient = setupLLMClient("hybrid");
  const stagehand = new Stagehand({ env: "LOCAL", verbose: 0, llmClient });
  await stagehand.init();

  const page = stagehand.context.pages()[0];
  const recorder = new PlaywrightRecorder();

  // ── Navigate to BBB and search ────────────────────────────────────
  console.log("\n🌐 Navigating to BBB.org...");
  await page.goto("https://www.bbb.org");
  await page.waitForLoadState("networkidle");
  await new Promise((r) => setTimeout(r, 3000));
  recorder.record("goto", "Navigate to https://www.bbb.org", { url: "https://www.bbb.org" });
  console.log("✅ Loaded");

  // Search for the business
  await stagehand.act("Type " + QUERY + " in the Find search box");
  await new Promise((r) => setTimeout(r, 1000));
  await stagehand.act("Click the Search button");
  await page.waitForLoadState("networkidle");
  await new Promise((r) => setTimeout(r, 5000));
  recorder.record("search", "Search for " + QUERY);
  console.log("✅ Search results loaded");

  // Click first result
  await stagehand.act("Click the first business result link");
  await page.waitForLoadState("domcontentloaded");
  await new Promise((r) => setTimeout(r, 8000));
  recorder.record("click", "Click first business result");
  console.log("✅ Profile page loaded:", page.url());

  // ── Extract with AI ───────────────────────────────────────────────
  const ProfileSchema = z.object({
    business_name: z.string(),
    bbb_rating: z.string(),
    accreditation: z.string(),
  });

  const mainData = await stagehand.extract(
    "Extract the business name, BBB rating (letter grade), and accreditation status (Accredited or Not Accredited).",
    ProfileSchema
  );
  recorder.record("extract", "Extract main profile data");
  console.log("\n📋 Business: " + mainData.business_name);
  console.log("   BBB Rating: " + mainData.bbb_rating);
  console.log("   Accreditation: " + mainData.accreditation);

  // Click Reviews tab
  await stagehand.act("Click the REVIEWS tab");
  await new Promise((r) => setTimeout(r, 5000));

  const ReviewSchema = z.object({
    customer_review_rating: z.string(),
    review_count: z.string(),
  });
  const reviewData = await stagehand.extract(
    "Extract the customer review rating (e.g. 1.06/5) and the total number of customer reviews.",
    ReviewSchema
  );
  recorder.record("extract", "Extract review data");
  console.log("   Customer Review Rating: " + reviewData.customer_review_rating);
  console.log("   Reviews: " + reviewData.review_count);

  // Click Complaints tab
  await stagehand.act("Click the COMPLAINTS tab");
  await new Promise((r) => setTimeout(r, 5000));

  const ComplaintSchema = z.object({
    total_complaints: z.string(),
  });
  const complaintData = await stagehand.extract(
    "Extract the total number of complaints in the last 3 years.",
    ComplaintSchema
  );
  recorder.record("extract", "Extract complaint data");
  console.log("   Total Complaints: " + complaintData.total_complaints);

  // ── Save Python & actions ─────────────────────────────────────────
  const pyPath = path.join(__dirname, "bbb_search.py");
  fs.writeFileSync(pyPath, genPython(), "utf-8");
  console.log("\n✅ Python: " + pyPath);

  const actionsPath = path.join(__dirname, "recorded_actions.json");
  fs.writeFileSync(actionsPath, JSON.stringify(recorder.actions, null, 2), "utf-8");
  console.log("📋 Actions: " + actionsPath);

  await stagehand.close();
  console.log("🎊 Done!");
})();
