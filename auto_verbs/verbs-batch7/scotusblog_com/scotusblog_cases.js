const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * SCOTUSblog – Case Files Browser
 *
 * Extracts Supreme Court case details:
 * case name, docket number, issue/holding, status.
 */

const CFG = {
  term: "ot2025",
  maxCases: 5,
  waits: { page: 5000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
SCOTUSblog – Case Files Browser

Generated on: ${ts}
Recorded ${n} browser interactions

Uses CDP-launched Chrome to avoid bot detection.
"""

import os, sys, shutil, re
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class CaseRequest:
    term: str = "${cfg.term}"
    max_cases: int = ${cfg.maxCases}


@dataclass
class Case:
    case_name: str = ""
    docket_number: str = ""
    issue: str = ""
    status: str = ""


@dataclass
class CaseResult:
    cases: List[Case] = field(default_factory=list)


def scotusblog_cases(page: Page, request: CaseRequest) -> CaseResult:
    """Browse SCOTUSblog for recent Supreme Court cases."""
    print(f"  Term: {request.term}\\n")

    url = f"https://www.scotusblog.com/case-files/terms/{request.term}/"
    print(f"Loading {url}...")
    checkpoint("Navigate to SCOTUSblog")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(${cfg.waits.page})

    result = CaseResult()

    checkpoint("Extract case entries")
    js_code = r${"`"}""(max) => {
        const body = document.body.innerText;
        const caseRegex = /([A-Z][A-Z\\s.,\\u2019\\u2018()\\\/]+?)\\s+No\\.\\s+([\\d-]+)\\s+\\[([^\\]]+)\\]\\s*\\n((?:Holding|Issue\\(s\\)):[\\s\\S]*?)(?=\\n(?:Case Preview|[A-Z][A-Z\\s.,\\u2019\\u2018()\\\/]+?\\s+No\\.))/g;
        const cases = [];
        let match;
        while ((match = caseRegex.exec(body)) !== null && cases.length < max) {
            const caseName = match[1].trim();
            const docket = 'No. ' + match[2].trim();
            const bracketInfo = match[3].trim();
            const holdingText = match[4].trim();
            let status = 'Pending';
            const decidedMatch = bracketInfo.match(/Decided\\s+([\\d.]+)/);
            if (decidedMatch) status = 'Decided ' + decidedMatch[1];
            let issue = holdingText.replace(/^(Holding|Issue\\(s\\)):\\s*/, '').replace(/\\n/g, ' ').trim();
            if (issue.length > 300) issue = issue.substring(0, 297) + '...';
            cases.push({caseName, docket, issue, status});
        }
        return cases;
    }${"`"}""
    cases_data = page.evaluate(js_code, request.max_cases)

    for cd in cases_data:
        case = Case()
        case.case_name = cd.get("caseName", "")
        case.docket_number = cd.get("docket", "")
        case.issue = cd.get("issue", "")
        case.status = cd.get("status", "")
        result.cases.append(case)

    for i, c in enumerate(result.cases, 1):
        print(f"\\n  Case {i}:")
        print(f"    Name:    {c.case_name}")
        print(f"    Docket:  {c.docket_number}")
        print(f"    Status:  {c.status}")
        print(f"    Issue:   {c.issue[:150]}...")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("scotusblog")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            request = CaseRequest()
            result = scotusblog_cases(page, request)
            print("\\n=== DONE ===")
            print(f"Found {len(result.cases)} cases")
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
  const stagehand = new Stagehand({ env: "LOCAL", llmClient, headless: false });
  await stagehand.init();
  const recorder = new PlaywrightRecorder(stagehand.page);
  const page = stagehand.page;

  try {
    const url = `https://www.scotusblog.com/case-files/terms/${CFG.term}/`;
    console.log(`Navigating to ${url}`);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(CFG.waits.page);

    const result = await stagehand.extract({
      instruction: `Extract the first ${CFG.maxCases} Supreme Court cases. For each get: case name, docket number, legal issue or holding, and current status (decided date or pending).`,
      schema: {
        type: "object",
        properties: {
          cases: {
            type: "array",
            items: {
              type: "object",
              properties: {
                case_name: { type: "string" },
                docket_number: { type: "string" },
                issue: { type: "string" },
                status: { type: "string" },
              },
            },
          },
        },
      },
    });

    console.log(`\nExtracted ${result.cases?.length || 0} cases`);
    for (const c of result.cases || []) {
      console.log(`\n  Name:    ${c.case_name}`);
      console.log(`  Docket:  ${c.docket_number}`);
      console.log(`  Status:  ${c.status}`);
      console.log(`  Issue:   ${c.issue?.substring(0, 150)}...`);
    }

    recorder.actions.push({ type: "extract", data: result });
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(__dirname, "scotusblog_cases.py"), pyCode);
    console.log("\nSaved scotusblog_cases.py");
  } finally {
    await stagehand.close();
  }
})();
