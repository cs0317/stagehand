const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * We Work Remotely – Remote Job Search
 *
 * Searches weworkremotely.com for remote jobs and extracts
 * job title, company, job type, region, and posting date.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  query: "backend developer",
  maxJobs: 5,
  waits: { page: 5000 },
};

// ── Python Script Generator ──────────────────────────────────────────────────
function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
We Work Remotely – Remote Job Search
Query: "${cfg.query}"

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
class WWRRequest:
    query: str = "${cfg.query}"
    max_jobs: int = ${cfg.maxJobs}


@dataclass
class RemoteJob:
    title: str = ""
    company: str = ""
    job_type: str = ""
    region: str = ""
    posting_date: str = ""


@dataclass
class WWRResult:
    jobs: list = field(default_factory=list)


def wwr_search(page: Page, request: WWRRequest) -> WWRResult:
    """Search We Work Remotely for remote jobs."""
    print(f"  Query: {request.query}\\n")

    # ── Search ────────────────────────────────────────────────────────
    search_url = f"https://weworkremotely.com/remote-jobs/search?term={quote_plus(request.query)}"
    print(f"Loading {search_url}...")
    checkpoint("Navigate to WWR search")
    page.goto(search_url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    # ── Extract jobs ──────────────────────────────────────────────────
    raw_jobs = page.evaluate(r"""(maxJobs) => {
        const items = document.querySelectorAll('li.feature');
        const results = [];
        for (const item of items) {
            if (results.length >= maxJobs) break;
            const lines = item.innerText.split('\\n').filter(l => l.trim());
            // Pattern: title, days, company, location, [Featured], type, [salary], region
            if (lines.length < 4) continue;
            // Skip ads (bootcamps, etc.)
            if (/BOOTCAMP|SPONSORED/i.test(item.innerText)) continue;
            const title = lines[0];
            const postingDate = lines[1];
            const company = lines[2];
            // Find job type (Full-Time or Contract)
            let jobType = '';
            let region = '';
            for (const line of lines) {
                if (/Full-Time|Contract|Part-Time|Freelance/i.test(line)) jobType = line;
                if (/Anywhere|World|USA|Europe|Americas|EMEA/i.test(line)) region = line;
            }
            results.push({ title, company, job_type: jobType, region, posting_date: postingDate });
        }
        return results;
    }""", request.max_jobs)

    # ── Print results ─────────────────────────────────────────────────
    print("\\n" + "=" * 60)
    print(f"We Work Remotely: {request.query}")
    print("=" * 60)
    for idx, j in enumerate(raw_jobs, 1):
        print(f"\\n  {idx}. {j['title']}")
        print(f"     Company: {j['company']}")
        print(f"     Type: {j['job_type']}")
        print(f"     Region: {j['region']}")
        print(f"     Posted: {j['posting_date']}")

    jobs = [RemoteJob(**j) for j in raw_jobs]
    return WWRResult(jobs=jobs)


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("weworkremotely_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = wwr_search(page, WWRRequest())
            print(f"\\nReturned {len(result.jobs)} jobs")
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
    const searchUrl = `https://weworkremotely.com/remote-jobs/search?term=${encodeURIComponent(CFG.query)}`;
    console.log(`\n🌐 Searching: ${searchUrl}...`);
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url: searchUrl, description: "Search WWR" });

    const jobs = await page.evaluate((maxJobs) => {
      const items = document.querySelectorAll("li.feature");
      const results = [];
      for (const item of items) {
        if (results.length >= maxJobs) break;
        const lines = item.innerText.split("\n").filter(l => l.trim());
        if (lines.length < 4) continue;
        // Skip ads (bootcamps, etc.)
        if (/BOOTCAMP|SPONSORED/i.test(item.innerText)) continue;
        const title = lines[0];
        const postingDate = lines[1];
        const company = lines[2];
        let jobType = "";
        let region = "";
        for (const line of lines) {
          if (/Full-Time|Contract|Part-Time|Freelance/i.test(line)) jobType = line;
          if (/Anywhere|World|USA|Europe|Americas|EMEA/i.test(line)) region = line;
        }
        results.push({ title, company, job_type: jobType, region, posting_date: postingDate });
      }
      return results;
    }, CFG.maxJobs);

    recorder.record("extract", {
      instruction: "Extract remote jobs",
      description: `Extracted ${jobs.length} jobs`,
      results: jobs,
    });

    console.log("\n" + "=".repeat(60));
    console.log(`We Work Remotely: ${CFG.query}`);
    console.log("=".repeat(60));
    jobs.forEach((j, i) => {
      console.log(`\n  ${i + 1}. ${j.title}`);
      console.log(`     Company: ${j.company}`);
      console.log(`     Type: ${j.job_type}`);
      console.log(`     Region: ${j.region}`);
      console.log(`     Posted: ${j.posting_date}`);
    });

    const dir = path.join(__dirname);
    fs.writeFileSync(
      path.join(dir, "recorded_actions.json"),
      JSON.stringify(recorder.actions, null, 2)
    );
    console.log(`\n💾 Saved ${recorder.actions.length} actions`);

    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(dir, "wwr_search.py"), pyCode);
    console.log("🐍 Saved Python script");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
