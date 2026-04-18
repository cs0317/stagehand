const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  query: "environmental policy",
  location: "Washington, DC",
  maxResults: 5,
  waits: { page: 5000, action: 2000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Idealist – Non-Profit Job Search
Query: "${cfg.query}"
Location: "${cfg.location}"

Generated on: ${ts}
Recorded ${n} browser interactions
"""

import re
import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class JobRequest:
    query: str = "${cfg.query}"
    location: str = "${cfg.location}"
    max_results: int = ${cfg.maxResults}


@dataclass
class Job:
    title: str = ""
    organization: str = ""
    location: str = ""
    job_type: str = ""


@dataclass
class JobResult:
    jobs: List[Job] = field(default_factory=list)


def idealist_search(page: Page, request: JobRequest) -> JobResult:
    """Search Idealist for non-profit jobs."""
    print(f"  Query: {request.query}")
    print(f"  Location: {request.location}\\n")

    url = f"https://www.idealist.org/en/jobs?q={request.query.replace(' ', '%20')}&loc={request.location.replace(' ', '%20').replace(',', '%2C')}"
    print(f"Loading {url}...")
    checkpoint("Navigate to Idealist job search")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    checkpoint("Extract job listings")
    jobs = []

    cards = page.locator("a[class*='listing'], a[data-testid*='listing'], div[class*='listing'] a, a[href*='/job/']").all()
    for card in cards[:request.max_results]:
        try:
            text = card.inner_text().strip()
            lines = [l.strip() for l in text.split("\\n") if l.strip()]
            if not lines:
                continue
            title = lines[0]
            org = lines[1] if len(lines) > 1 else ""
            loc = ""
            jtype = ""
            for line in lines:
                if any(kw in line.lower() for kw in ["full-time", "part-time", "volunteer", "internship", "contract"]):
                    jtype = line
                if any(kw in line for kw in [", ", "DC", "VA", "MD", "Remote"]):
                    if line != title and line != org:
                        loc = line
            if title and len(title) > 3:
                jobs.append(Job(title=title[:120], organization=org[:80], location=loc[:60], job_type=jtype[:30]))
        except Exception:
            pass

    if not jobs:
        body_text = page.evaluate("document.body.innerText") or ""
        lines = [l.strip() for l in body_text.split("\\n") if l.strip() and len(l.strip()) > 10]
        for line in lines[:50]:
            if any(kw in line.lower() for kw in ["policy", "environment", "director", "analyst", "coordinator", "manager"]):
                jobs.append(Job(title=line[:120]))
                if len(jobs) >= request.max_results:
                    break

    result = JobResult(jobs=jobs[:request.max_results])

    print("\\n" + "=" * 60)
    print(f"Idealist: {request.query} near {request.location}")
    print("=" * 60)
    for i, j in enumerate(result.jobs, 1):
        print(f"  {i}. {j.title}")
        if j.organization:
            print(f"     Org:      {j.organization}")
        if j.location:
            print(f"     Location: {j.location}")
        if j.job_type:
            print(f"     Type:     {j.job_type}")
    print(f"\\nTotal: {len(result.jobs)} jobs")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("idealist_org")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = idealist_search(page, JobRequest())
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
    const searchUrl = `https://www.idealist.org/en/jobs?q=${encodeURIComponent(CFG.query)}&loc=${encodeURIComponent(CFG.location)}`;
    console.log(`\n🌐 Loading: ${searchUrl}...`);
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url: searchUrl, description: "Navigate to Idealist job search" });

    const jobs = await stagehand.extract(
      `extract up to ${CFG.maxResults} job listings with job title, organization name, location, and job type`
    );
    console.log("\n📊 Jobs:", JSON.stringify(jobs, null, 2));
    recorder.record("extract", { instruction: "Extract job listings", results: jobs });

    const dir = path.join(__dirname);
    fs.writeFileSync(path.join(dir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    console.log(`\n💾 Saved ${recorder.actions.length} actions`);

    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(dir, "idealist_search.py"), pyCode);
    console.log("🐍 Saved Python script");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
