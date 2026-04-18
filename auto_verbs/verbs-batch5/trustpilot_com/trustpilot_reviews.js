const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Trustpilot – Company Reviews
 *
 * Searches Trustpilot for a company and extracts TrustScore, total reviews,
 * and recent individual reviews with name, rating, and text.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  company: "Airbnb",
  maxReviews: 5,
  waits: { page: 8000 },
};

// ── Python Script Generator ──────────────────────────────────────────────────
function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Trustpilot – Company Reviews
Company: "${cfg.company}"

Generated on: ${ts}
Recorded ${n} browser interactions

Uses Playwright's native locator API with the user's Chrome profile.
"""

import re
import os, sys, shutil
from dataclasses import dataclass, field
from urllib.parse import quote_plus
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class TrustpilotRequest:
    company: str = "${cfg.company}"
    max_reviews: int = ${cfg.maxReviews}


@dataclass
class Review:
    reviewer_name: str = ""
    rating: str = ""
    review_text: str = ""


@dataclass
class TrustpilotResult:
    company_name: str = ""
    trust_score: str = ""
    total_reviews: str = ""
    reviews: list = field(default_factory=list)


def trustpilot_search(page: Page, request: TrustpilotRequest) -> TrustpilotResult:
    """Search Trustpilot for company reviews."""
    print(f"  Company: {request.company}\\n")

    # ── Search ────────────────────────────────────────────────────────
    search_url = f"https://www.trustpilot.com/search?query={quote_plus(request.company)}"
    print(f"Loading {search_url}...")
    checkpoint("Search for company")
    page.goto(search_url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    # Find first company link
    company_url = page.evaluate(r"""() => {
        const links = document.querySelectorAll('a[href*="/review/"]');
        return links.length > 0 ? links[0].href : null;
    }""")

    if not company_url:
        print("No company found!")
        return TrustpilotResult()

    print(f"Company page: {company_url}")
    checkpoint("Navigate to company page")
    page.goto(company_url, wait_until="domcontentloaded")
    page.wait_for_timeout(8000)

    # ── Extract company summary ───────────────────────────────────────
    summary = page.evaluate(r"""() => {
        const title = document.title;
        const nameMatch = title.match(/^(.+?)\\s+Reviews/);
        const score = document.querySelector('[data-rating-typography]');
        const total = document.querySelector('[data-reviews-count-typography]');
        return {
            company_name: nameMatch ? nameMatch[1] : '',
            trust_score: score ? score.innerText.trim() : '',
            total_reviews: total ? total.innerText.trim().replace(' total', '') : '',
        };
    }""")

    # ── Extract reviews ───────────────────────────────────────────────
    raw_reviews = page.evaluate(r"""(maxReviews) => {
        const cards = document.querySelectorAll('[data-service-review-card-paper]');
        const results = [];
        for (let i = 0; i < Math.min(maxReviews, cards.length); i++) {
            const card = cards[i];
            const nameEl = card.querySelector('[data-consumer-name-typography]');
            const starImg = card.querySelector('img[alt*="Rated"]');
            const text = card.innerText;
            // Extract review text: after the date line (e.g., "Apr 10, 2026\\n\\n")
            // Review text appears between first \\n\\n and \\n\\nUseful
            const parts = text.split('\\n\\n');
            let reviewText = '';
            if (parts.length >= 2) {
                const rest = parts.slice(1).join('\\n\\n');
                reviewText = rest.split('\\n\\nUseful')[0].trim();
            }
            if (reviewText.length > 150) reviewText = reviewText.substring(0, 150) + '...';
            results.push({
                reviewer_name: nameEl ? nameEl.innerText.trim() : '',
                rating: starImg ? starImg.alt : '',
                review_text: reviewText,
            });
        }
        return results;
    }""", request.max_reviews)

    # ── Print results ─────────────────────────────────────────────────
    print("\\n" + "=" * 60)
    print(f"Trustpilot: {summary['company_name']}")
    print("=" * 60)
    print(f"  TrustScore: {summary['trust_score']}")
    print(f"  Total Reviews: {summary['total_reviews']}")
    for idx, r in enumerate(raw_reviews, 1):
        print(f"\\n  Review {idx}:")
        print(f"    Reviewer: {r['reviewer_name']}")
        print(f"    Rating: {r['rating']}")
        print(f"    Text: {r['review_text']}")

    reviews = [Review(**r) for r in raw_reviews]
    return TrustpilotResult(
        company_name=summary["company_name"],
        trust_score=summary["trust_score"],
        total_reviews=summary["total_reviews"],
        reviews=reviews,
    )


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("trustpilot_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = trustpilot_search(page, TrustpilotRequest())
            print(f"\\nReturned {len(result.reviews)} reviews")
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
    // Step 1: Search for company
    const searchUrl = `https://www.trustpilot.com/search?query=${encodeURIComponent(CFG.company)}`;
    console.log(`\n🌐 Searching: ${searchUrl}...`);
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(5000);
    recorder.record("goto", { url: searchUrl, description: "Search Trustpilot" });

    // Step 2: Find first company link
    const companyUrl = await page.evaluate(() => {
      const links = document.querySelectorAll('a[href*="/review/"]');
      return links.length > 0 ? links[0].href : null;
    });
    if (!companyUrl) throw new Error("No company found");
    console.log(`📍 Company: ${companyUrl}`);

    await page.goto(companyUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url: companyUrl, description: "Navigate to company page" });

    // Step 3: Extract summary
    const summary = await page.evaluate(() => {
      const title = document.title;
      const nameMatch = title.match(/^(.+?)\s+Reviews/);
      const score = document.querySelector("[data-rating-typography]");
      const total = document.querySelector("[data-reviews-count-typography]");
      return {
        company_name: nameMatch ? nameMatch[1] : "",
        trust_score: score ? score.innerText.trim() : "",
        total_reviews: total ? total.innerText.trim().replace(" total", "") : "",
      };
    });

    // Step 4: Extract reviews
    const reviews = await page.evaluate((maxReviews) => {
      const cards = document.querySelectorAll("[data-service-review-card-paper]");
      const results = [];
      for (let i = 0; i < Math.min(maxReviews, cards.length); i++) {
        const card = cards[i];
        const nameEl = card.querySelector("[data-consumer-name-typography]");
        const starImg = card.querySelector('img[alt*="Rated"]');
        const text = card.innerText;
        // Review text appears between first \n\n and \n\nUseful
        const parts = text.split("\n\n");
        let reviewText = "";
        if (parts.length >= 2) {
          // Join all parts after the first, up to "Useful"
          const rest = parts.slice(1).join("\n\n");
          reviewText = rest.split("\n\nUseful")[0].trim();
        }
        if (reviewText.length > 150) reviewText = reviewText.substring(0, 150) + "...";
        results.push({
          reviewer_name: nameEl ? nameEl.innerText.trim() : "",
          rating: starImg ? starImg.alt : "",
          review_text: reviewText,
        });
      }
      return results;
    }, CFG.maxReviews);

    recorder.record("extract", {
      instruction: "Extract reviews",
      description: `Extracted ${reviews.length} reviews`,
      results: { summary, reviews },
    });

    console.log("\n" + "=".repeat(60));
    console.log(`Trustpilot: ${summary.company_name}`);
    console.log("=".repeat(60));
    console.log(`  TrustScore: ${summary.trust_score}`);
    console.log(`  Total Reviews: ${summary.total_reviews}`);
    reviews.forEach((r, i) => {
      console.log(`\n  Review ${i + 1}:`);
      console.log(`    Reviewer: ${r.reviewer_name}`);
      console.log(`    Rating: ${r.rating}`);
      console.log(`    Text: ${r.review_text}`);
    });

    const dir = path.join(__dirname);
    fs.writeFileSync(
      path.join(dir, "recorded_actions.json"),
      JSON.stringify(recorder.actions, null, 2)
    );
    console.log(`\n💾 Saved ${recorder.actions.length} actions`);

    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(dir, "trustpilot_reviews.py"), pyCode);
    console.log("🐍 Saved Python script");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
