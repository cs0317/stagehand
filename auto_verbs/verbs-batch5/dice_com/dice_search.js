const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * dice.com – Tech Job Search
 *
 * Searches dice.com for job listings and extracts
 * job title, company, location, date, salary.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  url: "https://www.dice.com",
  searchQuery: "machine learning engineer",
  maxResults: 5,
  waits: { page: 10000 },
};

// ── Python Script Generator ──────────────────────────────────────────────────
function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
dice.com – Tech Job Search
Query: ${cfg.searchQuery}

Generated on: ${ts}
Recorded ${n} browser interactions

Uses Playwright's native locator API with the user's Chrome profile.
"""

import re
import os, sys, shutil, urllib.parse
from dataclasses import dataclass
from playwright.sync_api import Playwright, sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class DiceSearchRequest:
    search_query: str = "${cfg.searchQuery}"
    max_results: int = ${cfg.maxResults}


@dataclass(frozen=True)
class DiceJob:
    job_title: str = ""
    company_name: str = ""
    location: str = ""
    posted_date: str = ""
    salary_range: str = ""


@dataclass(frozen=True)
class DiceSearchResult:
    jobs: list = None  # list[DiceJob]


def dice_search(page: Page, request: DiceSearchRequest) -> DiceSearchResult:
    """Search dice.com for tech jobs."""
    query = request.search_query
    max_results = request.max_results
    print(f"  Query: {query}")
    print(f"  Max results: {max_results}\\n")

    # ── Navigate to search ────────────────────────────────────────────
    url = f"https://www.dice.com/jobs?q={urllib.parse.quote_plus(query)}"
    print(f"Loading {url}...")
    checkpoint("Navigate to Dice search")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(10000)
    print(f"  Loaded: {page.url}")

    # ── Extract jobs ──────────────────────────────────────────────────
    checkpoint("Extract job listings")
    results_data = page.evaluate(r"""(maxResults) => {
        const titleLinks = document.querySelectorAll('[data-testid="job-search-job-detail-link"]');
        const results = [];
        for (const link of titleLinks) {
            if (results.length >= maxResults) break;
            const jobTitle = link.textContent.trim();

            // Navigate up to card container
            let card = link;
            for (let j = 0; j < 15; j++) {
                card = card.parentElement;
                if (!card) break;
                const text = card.innerText;
                if (text.includes(jobTitle) && text.length > 200) {
                    const lines = text.split('\\n').map(l => l.trim()).filter(l => l);
                    const titleIdx = lines.indexOf(jobTitle);
                    if (titleIdx > 0) break;
                }
            }
            if (!card) continue;

            const text = card.innerText;
            const lines = text.split('\\n').map(l => l.trim()).filter(l => l);
            const titleIdx = lines.indexOf(jobTitle);

            // Company name: first line (before "Easy Apply" or title)
            let companyName = '';
            for (let i = 0; i < titleIdx; i++) {
                if (lines[i] !== 'Easy Apply') { companyName = lines[i]; break; }
            }

            // Location: first line after title that looks like "City, State"
            let location = '';
            for (let i = titleIdx + 1; i < lines.length; i++) {
                if (lines[i] !== '\u2022' && lines[i].includes(',')) { location = lines[i]; break; }
            }

            // Posted date: line after bullet separator
            let postedDate = '';
            const bulletIdx = lines.indexOf('\u2022');
            if (bulletIdx > -1 && bulletIdx + 1 < lines.length) {
                postedDate = lines[bulletIdx + 1];
            }

            // Salary: last line if it contains $ or "Experience"
            const lastLine = lines[lines.length - 1] || '';
            const salary = (lastLine.includes('$') || lastLine.toLowerCase().includes('experience'))
                ? lastLine : 'Not listed';

            results.push({ jobTitle, companyName, location, postedDate, salary });
        }
        return results;
    }""", max_results)

    jobs = []
    for r in results_data:
        jobs.append(DiceJob(
            job_title=r.get("jobTitle", ""),
            company_name=r.get("companyName", ""),
            location=r.get("location", ""),
            posted_date=r.get("postedDate", ""),
            salary_range=r.get("salary", "Not listed"),
        ))

    # ── Print results ─────────────────────────────────────────────────
    print("=" * 60)
    print(f'dice.com - "{query}" Jobs')
    print("=" * 60)
    for idx, j in enumerate(jobs, 1):
        print(f"\\n{idx}. {j.job_title}")
        print(f"   Company: {j.company_name}")
        print(f"   Location: {j.location} | Posted: {j.posted_date}")
        print(f"   Salary: {j.salary_range}")

    print(f"\\nFound {len(jobs)} jobs")
    return DiceSearchResult(jobs=jobs)


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("dice_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = dice_search(page, DiceSearchRequest())
            print(f"\\nReturned {len(result.jobs or [])} jobs")
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
      args: [
        "--disable-blink-features=AutomationControlled",
        "--start-maximized",
      ],
    },
  });
  await stagehand.init();
  const page = stagehand.context.pages()[0];
  const recorder = new PlaywrightRecorder();

  try {
    const query = encodeURIComponent(CFG.searchQuery);
    const url = `${CFG.url}/jobs?q=${query}`;
    console.log(`\n🌐 Navigating to ${url}...`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url, description: `Search Dice for "${CFG.searchQuery}"` });
    console.log(`   Loaded: ${page.url()}`);

    console.log(`\n🎯 Extracting up to ${CFG.maxResults} jobs...\n`);

    const results = await page.evaluate((maxResults) => {
      const titleLinks = document.querySelectorAll('[data-testid="job-search-job-detail-link"]');
      const out = [];
      for (const link of titleLinks) {
        if (out.length >= maxResults) break;
        const jobTitle = link.textContent.trim();
        let card = link;
        for (let j = 0; j < 15; j++) {
          card = card.parentElement;
          if (!card) break;
          const text = card.innerText;
          if (text.includes(jobTitle) && text.length > 200) {
            const lines = text.split("\n").map(l => l.trim()).filter(l => l);
            const titleIdx = lines.indexOf(jobTitle);
            if (titleIdx > 0) break;
          }
        }
        if (!card) continue;
        const text = card.innerText;
        const lines = text.split("\n").map(l => l.trim()).filter(l => l);
        const titleIdx = lines.indexOf(jobTitle);
        let companyName = "";
        for (let i = 0; i < titleIdx; i++) {
          if (lines[i] !== "Easy Apply") { companyName = lines[i]; break; }
        }
        let location = "";
        for (let i = titleIdx + 1; i < lines.length; i++) {
          if (lines[i] !== "\u2022" && lines[i].includes(",")) { location = lines[i]; break; }
        }
        let postedDate = "";
        const bulletIdx = lines.indexOf("\u2022");
        if (bulletIdx > -1 && bulletIdx + 1 < lines.length) postedDate = lines[bulletIdx + 1];
        const lastLine = lines[lines.length - 1] || "";
        const salary = (lastLine.includes("$") || lastLine.toLowerCase().includes("experience"))
          ? lastLine : "Not listed";
        out.push({ jobTitle, companyName, location, postedDate, salary });
      }
      return out;
    }, CFG.maxResults);

    recorder.record("extract", {
      instruction: "Extract job listings",
      description: `Extracted ${results.length} jobs`,
      results,
    });

    console.log(`📋 Found ${results.length} jobs:\n`);
    results.forEach((r, i) => {
      console.log(`   ${i + 1}. ${r.jobTitle}`);
      console.log(`      Company: ${r.companyName} | Location: ${r.location}`);
      console.log(`      Posted: ${r.postedDate} | Salary: ${r.salary}`);
    });

    const dir = path.join(__dirname);
    const actionsFile = path.join(dir, "recorded_actions.json");
    fs.writeFileSync(actionsFile, JSON.stringify(recorder.actions, null, 2));
    console.log(`\n💾 Saved ${recorder.actions.length} actions → ${actionsFile}`);

    const pyFile = path.join(dir, "dice_search.py");
    fs.writeFileSync(pyFile, genPython(CFG, recorder));
    console.log(`🐍 Saved Python script → ${pyFile}`);

  } catch (err) {
    console.error("❌ Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
