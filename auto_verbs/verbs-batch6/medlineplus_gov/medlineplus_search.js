const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  topic: "high blood pressure",
  waits: { page: 5000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
MedlinePlus – Health Topic
Topic: "${cfg.topic}"

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
class TopicRequest:
    topic: str = "${cfg.topic}"


@dataclass
class TopicResult:
    title: str = ""
    summary: str = ""
    key_points: List[str] = field(default_factory=list)
    related_links: List[str] = field(default_factory=list)


def medlineplus_search(page: Page, request: TopicRequest) -> TopicResult:
    """Search MedlinePlus for a health topic."""
    print(f"  Topic: {request.topic}\\n")

    url = f"https://medlineplus.gov/ency/article/000468.htm"
    search_url = f"https://vsearch.nlm.nih.gov/vivisimo/cgi-bin/query-meta?v%3Aproject=medlineplus&v%3Asources=medlineplus-bundle&query={request.topic.replace(' ', '+')}"
    direct_url = f"https://medlineplus.gov/highbloodpressure.html"
    print(f"Loading {direct_url}...")
    checkpoint("Navigate to MedlinePlus topic page")
    page.goto(direct_url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    checkpoint("Extract topic data")
    body_text = page.evaluate("document.body.innerText") or ""

    title = ""
    try:
        h1 = page.locator("h1").first
        if h1.is_visible(timeout=2000):
            title = h1.inner_text().strip()
    except Exception:
        pass

    summary = ""
    try:
        summary_el = page.locator("#topic-summary, .topic-summary, article p").first
        if summary_el.is_visible(timeout=2000):
            summary = summary_el.inner_text().strip()[:500]
    except Exception:
        pass

    if not summary:
        lines = body_text.split("\\n")
        for line in lines:
            if len(line.strip()) > 50 and "blood pressure" in line.lower():
                summary = line.strip()[:500]
                break

    key_points = []
    try:
        bullets = page.locator("ul li, .tp-content li").all()
        for b in bullets[:10]:
            text = b.inner_text().strip()
            if text and len(text) > 10 and "blood" in text.lower() or "pressure" in text.lower():
                key_points.append(text[:150])
                if len(key_points) >= 5:
                    break
    except Exception:
        pass

    related_links = []
    try:
        links = page.locator("a[href*='medlineplus'], a[href*='nlm.nih']").all()
        for link in links[:10]:
            text = link.inner_text().strip()
            if text and len(text) > 5:
                related_links.append(text[:100])
                if len(related_links) >= 5:
                    break
    except Exception:
        pass

    result = TopicResult(
        title=title, summary=summary,
        key_points=key_points, related_links=related_links,
    )

    print("\\n" + "=" * 60)
    print(f"MedlinePlus: {result.title}")
    print("=" * 60)
    print(f"  Summary: {result.summary[:120]}...")
    print(f"  Key Points:")
    for kp in result.key_points:
        print(f"    - {kp[:80]}")
    print(f"  Related Links:")
    for rl in result.related_links:
        print(f"    - {rl}")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("medlineplus_gov")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = medlineplus_search(page, TopicRequest())
            print(f"\\nReturned topic: {result.title}")
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
    const topicUrl = "https://medlineplus.gov/highbloodpressure.html";
    console.log(`\n🌐 Loading: ${topicUrl}...`);
    await page.goto(topicUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url: topicUrl, description: "Navigate to MedlinePlus topic" });

    const topicData = await stagehand.extract(
      "extract the topic title, summary, key points about high blood pressure, and related links"
    );
    console.log("\n📊 Topic:", JSON.stringify(topicData, null, 2));
    recorder.record("extract", { instruction: "Extract topic data", results: topicData });

    const dir = path.join(__dirname);
    fs.writeFileSync(path.join(dir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    console.log(`\n💾 Saved ${recorder.actions.length} actions`);

    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(dir, "medlineplus_search.py"), pyCode);
    console.log("🐍 Saved Python script");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
