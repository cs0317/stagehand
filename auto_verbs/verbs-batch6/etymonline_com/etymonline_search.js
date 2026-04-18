const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  word: "algorithm",
  waits: { page: 5000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Etymonline – Word Etymology
Word: "${cfg.word}"

Generated on: ${ts}
Recorded ${n} browser interactions
"""

import re
import os, sys, shutil
from dataclasses import dataclass
from urllib.parse import quote_plus
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class EtymologyRequest:
    word: str = "${cfg.word}"


@dataclass
class EtymologyResult:
    word: str = ""
    origin_language: str = ""
    earliest_date: str = ""
    description: str = ""


def etymonline_search(page: Page, request: EtymologyRequest) -> EtymologyResult:
    """Look up word etymology on Etymonline."""
    print(f"  Word: {request.word}\\n")

    url = f"https://www.etymonline.com/word/{quote_plus(request.word)}"
    print(f"Loading {url}...")
    checkpoint("Navigate to Etymonline word page")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    checkpoint("Extract etymology data")
    body_text = page.evaluate("document.body.innerText") or ""

    word = request.word
    origin_language = ""
    earliest_date = ""
    description = ""

    try:
        h1 = page.locator("h1").first
        if h1.is_visible(timeout=2000):
            word = h1.inner_text().strip()
    except Exception:
        pass

    section = page.locator('[class*="word--"] section, [class*="word__def"]').first
    try:
        if section.is_visible(timeout=2000):
            description = section.inner_text().strip()[:500]
    except Exception:
        lines = body_text.split("\\n")
        for line in lines:
            if len(line) > 50 and request.word.lower() in line.lower():
                description = line.strip()[:500]
                break

    dm = re.search(r"(\\d{4})", description or body_text)
    if dm:
        earliest_date = dm.group(1)

    langs = ["Latin", "Greek", "French", "Old English", "Arabic", "Sanskrit",
             "German", "Italian", "Spanish", "Old French", "Medieval Latin",
             "Proto-Germanic", "Proto-Indo-European", "Middle English"]
    for lang in langs:
        if lang.lower() in (description or body_text).lower():
            origin_language = lang
            break

    result = EtymologyResult(
        word=word, origin_language=origin_language,
        earliest_date=earliest_date, description=description,
    )

    print("\\n" + "=" * 60)
    print(f"Etymonline: {result.word}")
    print("=" * 60)
    print(f"  Origin Language:  {result.origin_language}")
    print(f"  Earliest Date:    {result.earliest_date}")
    print(f"  Description:      {result.description[:120]}...")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("etymonline_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = etymonline_search(page, EtymologyRequest())
            print(f"\\nReturned etymology for {result.word}")
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
    const url = `https://www.etymonline.com/word/${encodeURIComponent(CFG.word)}`;
    console.log(`\n🌐 Loading: ${url}...`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url, description: "Navigate to Etymonline" });

    const etymData = await stagehand.extract(
      "extract the word, origin language, earliest known usage date, and full etymology description"
    );
    console.log("\n📊 Etymology:", JSON.stringify(etymData, null, 2));
    recorder.record("extract", { instruction: "Extract etymology", results: etymData });

    const dir = path.join(__dirname);
    fs.writeFileSync(path.join(dir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    console.log(`\n💾 Saved ${recorder.actions.length} actions`);

    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(dir, "etymonline_search.py"), pyCode);
    console.log("🐍 Saved Python script");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
