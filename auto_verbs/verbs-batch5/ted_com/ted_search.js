const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * TED – Search TED Talks
 *
 * Searches ted.com/talks for talks on a topic and extracts
 * talk title, speaker name, and duration.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  query: "artificial intelligence",
  maxTalks: 5,
  waits: { page: 5000 },
};

// ── Python Script Generator ──────────────────────────────────────────────────
function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
TED – Search TED Talks
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
class TEDRequest:
    query: str = "${cfg.query}"
    max_talks: int = ${cfg.maxTalks}


@dataclass
class TEDTalk:
    title: str = ""
    speaker: str = ""
    duration: str = ""


@dataclass
class TEDResult:
    talks: list = field(default_factory=list)


def ted_search(page: Page, request: TEDRequest) -> TEDResult:
    """Search ted.com for talks."""
    print(f"  Query: {request.query}\\n")

    # ── Search ────────────────────────────────────────────────────────
    search_url = f"https://www.ted.com/talks?q={quote_plus(request.query)}"
    print(f"Loading {search_url}...")
    checkpoint("Navigate to TED talks search")
    page.goto(search_url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    # ── Extract talks ─────────────────────────────────────────────────
    raw_talks = page.evaluate(r"""(maxTalks) => {
        // Talk cards: div with col-span-1 class containing duration, title, speaker
        const cards = document.querySelectorAll('div[class*="col-span-1"]');
        const results = [];
        for (const card of cards) {
            if (results.length >= maxTalks) break;
            const text = card.innerText.trim();
            if (!text) continue;
            const lines = text.split('\\n').filter(l => l.trim());
            // Pattern: duration, title, speaker (uppercase)
            if (lines.length >= 3 && /^\\d+:\\d+$/.test(lines[0])) {
                results.push({
                    duration: lines[0],
                    title: lines[1],
                    speaker: lines[2],
                });
            }
        }
        return results;
    }""", request.max_talks)

    # ── Print results ─────────────────────────────────────────────────
    print("\\n" + "=" * 60)
    print(f"TED Talks: {request.query}")
    print("=" * 60)
    for idx, t in enumerate(raw_talks, 1):
        print(f"\\n  {idx}. {t['title']}")
        print(f"     Speaker: {t['speaker']}")
        print(f"     Duration: {t['duration']}")

    talks = [TEDTalk(**t) for t in raw_talks]
    return TEDResult(talks=talks)


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("ted_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = ted_search(page, TEDRequest())
            print(f"\\nReturned {len(result.talks)} talks")
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
    const searchUrl = `https://www.ted.com/talks?q=${encodeURIComponent(CFG.query)}`;
    console.log(`\n🌐 Searching: ${searchUrl}...`);
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url: searchUrl, description: "Search TED talks" });

    const talks = await page.evaluate((maxTalks) => {
      const cards = document.querySelectorAll('div[class*="col-span-1"]');
      const results = [];
      for (const card of cards) {
        if (results.length >= maxTalks) break;
        const text = card.innerText.trim();
        if (!text) continue;
        const lines = text.split("\n").filter(l => l.trim());
        if (lines.length >= 3 && /^\d+:\d+$/.test(lines[0])) {
          results.push({
            duration: lines[0],
            title: lines[1],
            speaker: lines[2],
          });
        }
      }
      return results;
    }, CFG.maxTalks);

    recorder.record("extract", {
      instruction: "Extract TED talks",
      description: `Extracted ${talks.length} talks`,
      results: talks,
    });

    console.log("\n" + "=".repeat(60));
    console.log(`TED Talks: ${CFG.query}`);
    console.log("=".repeat(60));
    talks.forEach((t, i) => {
      console.log(`\n  ${i + 1}. ${t.title}`);
      console.log(`     Speaker: ${t.speaker}`);
      console.log(`     Duration: ${t.duration}`);
    });

    const dir = path.join(__dirname);
    fs.writeFileSync(
      path.join(dir, "recorded_actions.json"),
      JSON.stringify(recorder.actions, null, 2)
    );
    console.log(`\n💾 Saved ${recorder.actions.length} actions`);

    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(dir, "ted_search.py"), pyCode);
    console.log("🐍 Saved Python script");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
