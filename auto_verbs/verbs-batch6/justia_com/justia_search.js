const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  query: "employment discrimination",
  maxResults: 5,
  waits: { page: 5000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Justia – Legal Case Search
Query: "${cfg.query}"

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
class CaseRequest:
    query: str = "${cfg.query}"
    max_results: int = ${cfg.maxResults}


@dataclass
class LegalCase:
    name: str = ""
    court: str = ""
    date: str = ""
    summary: str = ""


@dataclass
class CaseResult:
    cases: List[LegalCase] = field(default_factory=list)


def justia_search(page: Page, request: CaseRequest) -> CaseResult:
    """Search Justia for legal cases."""
    print(f"  Query: {request.query}\\n")

    url = f"https://www.justia.com/search?q={request.query.replace(' ', '+')}"
    print(f"Loading {url}...")
    checkpoint("Navigate to Justia search")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    checkpoint("Extract case results")
    cases = []

    results = page.locator("div.search-result, div[class*='result'], li[class*='result']").all()
    for res in results[:request.max_results]:
        try:
            text = res.inner_text().strip()
            lines = [l.strip() for l in text.split("\\n") if l.strip()]
            if not lines:
                continue
            name = lines[0][:120]
            court = ""
            date = ""
            summary = ""
            for line in lines[1:]:
                cm = re.search(r"(court|circuit|district|supreme|appellate)", line, re.IGNORECASE)
                if cm and not court:
                    court = line[:80]
                dm = re.search(r"(\\w+\\s+\\d{1,2},?\\s+\\d{4}|\\d{4}-\\d{2}-\\d{2})", line)
                if dm and not date:
                    date = dm.group(1)
                if len(line) > 50 and not summary:
                    summary = line[:200]
            cases.append(LegalCase(name=name, court=court, date=date, summary=summary))
        except Exception:
            pass

    if not cases:
        body_text = page.evaluate("document.body.innerText") or ""
        lines = [l.strip() for l in body_text.split("\\n") if l.strip() and len(l.strip()) > 15]
        for line in lines:
            if any(kw in line.lower() for kw in ["v.", "vs.", "case", "court"]):
                cases.append(LegalCase(name=line[:120]))
                if len(cases) >= request.max_results:
                    break

    result = CaseResult(cases=cases[:request.max_results])

    print("\\n" + "=" * 60)
    print(f"Justia: {request.query}")
    print("=" * 60)
    for i, c in enumerate(result.cases, 1):
        print(f"  {i}. {c.name}")
        if c.court:
            print(f"     Court:   {c.court}")
        if c.date:
            print(f"     Date:    {c.date}")
        if c.summary:
            print(f"     Summary: {c.summary[:80]}...")
    print(f"\\nTotal: {len(result.cases)} cases")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("justia_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = justia_search(page, CaseRequest())
            print(f"\\nReturned {len(result.cases)} cases")
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
    const searchUrl = `https://www.justia.com/search?q=${CFG.query.replace(/ /g, '+')}`;
    console.log(`\n🌐 Loading: ${searchUrl}...`);
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url: searchUrl, description: "Navigate to Justia search" });

    const cases = await stagehand.extract(
      `extract up to ${CFG.maxResults} case results with case name, court, date, and case summary`
    );
    console.log("\n📊 Cases:", JSON.stringify(cases, null, 2));
    recorder.record("extract", { instruction: "Extract case results", results: cases });

    const dir = path.join(__dirname);
    fs.writeFileSync(path.join(dir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    console.log(`\n💾 Saved ${recorder.actions.length} actions`);

    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(dir, "justia_search.py"), pyCode);
    console.log("🐍 Saved Python script");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
