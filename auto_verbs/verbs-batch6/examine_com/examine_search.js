const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  supplement: "creatine",
  waits: { page: 5000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Examine.com – Supplement Information
Supplement: "${cfg.supplement}"

Generated on: ${ts}
Recorded ${n} browser interactions
"""

import re
import os, sys, shutil
from dataclasses import dataclass
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class SupplementRequest:
    supplement: str = "${cfg.supplement}"


@dataclass
class SupplementResult:
    name: str = ""
    benefits: str = ""
    evidence_grade: str = ""
    dosage: str = ""
    findings: str = ""


def examine_search(page: Page, request: SupplementRequest) -> SupplementResult:
    """Look up supplement info on Examine.com."""
    print(f"  Supplement: {request.supplement}\\n")

    url = f"https://examine.com/supplements/{request.supplement}/"
    print(f"Loading {url}...")
    checkpoint("Navigate to Examine supplement page")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    checkpoint("Extract supplement data")
    body_text = page.evaluate("document.body.innerText") or ""

    name = request.supplement.title()
    benefits = ""
    evidence_grade = ""
    dosage = ""
    findings = ""

    try:
        h1 = page.locator("h1").first
        if h1.is_visible(timeout=2000):
            name = h1.inner_text().strip()
    except Exception:
        pass

    bm = re.search(r"(?:benefit|used for|help)[:\\s]+(.+?)(?:\\.|\\n\\n)", body_text, re.IGNORECASE | re.DOTALL)
    if bm:
        benefits = bm.group(1).strip()[:200]

    em = re.search(r"(?:evidence|grade|level)[:\\s]+([A-D]|Strong|Moderate|Low|Very High|High)", body_text, re.IGNORECASE)
    if em:
        evidence_grade = em.group(1)

    dm = re.search(r"(?:dosage|dose|recommended)[:\\s]+(.+?)(?:\\.|\\n)", body_text, re.IGNORECASE)
    if dm:
        dosage = dm.group(1).strip()[:200]

    fm = re.search(r"(?:research|finding|summary|overview)[:\\s]+(.+?)(?:\\n\\n|$)", body_text, re.IGNORECASE | re.DOTALL)
    if fm:
        findings = fm.group(1).strip()[:300]

    result = SupplementResult(
        name=name, benefits=benefits, evidence_grade=evidence_grade,
        dosage=dosage, findings=findings,
    )

    print("\\n" + "=" * 60)
    print(f"Examine: {result.name}")
    print("=" * 60)
    print(f"  Benefits:       {result.benefits[:80]}...")
    print(f"  Evidence Grade: {result.evidence_grade}")
    print(f"  Dosage:         {result.dosage[:80]}...")
    print(f"  Findings:       {result.findings[:80]}...")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("examine_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = examine_search(page, SupplementRequest())
            print(f"\\nReturned info for {result.name}")
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
    const url = `https://examine.com/supplements/${CFG.supplement}/`;
    console.log(`\n🌐 Loading: ${url}...`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url, description: "Navigate to Examine" });

    const suppData = await stagehand.extract(
      "extract the supplement name, primary benefits, evidence grade, dosage recommendation, and key research findings"
    );
    console.log("\n📊 Supplement:", JSON.stringify(suppData, null, 2));
    recorder.record("extract", { instruction: "Extract supplement info", results: suppData });

    const dir = path.join(__dirname);
    fs.writeFileSync(path.join(dir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    console.log(`\n💾 Saved ${recorder.actions.length} actions`);

    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(dir, "examine_search.py"), pyCode);
    console.log("🐍 Saved Python script");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
