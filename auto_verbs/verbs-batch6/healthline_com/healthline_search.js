const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  query: "intermittent fasting benefits",
  maxResults: 5,
  waits: { page: 5000, action: 2000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Healthline – Health Articles Search
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
class ArticleRequest:
    query: str = "${cfg.query}"
    max_results: int = ${cfg.maxResults}


@dataclass
class Article:
    title: str = ""
    author: str = ""
    date: str = ""
    summary: str = ""


@dataclass
class ArticleResult:
    articles: List[Article] = field(default_factory=list)


def healthline_search(page: Page, request: ArticleRequest) -> ArticleResult:
    """Search Healthline for health articles."""
    print(f"  Query: {request.query}\\n")

    url = f"https://www.healthline.com/search?q1={request.query.replace(' ', '+')}"
    print(f"Loading {url}...")
    checkpoint("Navigate to Healthline search")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    checkpoint("Extract search results")
    articles = []

    cards = page.locator("a[class*='result'], li[class*='result'], div[class*='result'] a").all()
    if not cards:
        cards = page.locator("a[href*='/health/'], a[href*='/nutrition/']").all()

    for card in cards[:request.max_results]:
        title = ""
        try:
            title = card.inner_text().strip().split("\\n")[0]
        except Exception:
            pass
        if title and len(title) > 5:
            articles.append(Article(title=title[:120]))

    if not articles:
        body_text = page.evaluate("document.body.innerText") or ""
        lines = [l.strip() for l in body_text.split("\\n") if l.strip() and len(l.strip()) > 15]
        for line in lines[:request.max_results]:
            if any(kw in line.lower() for kw in ["fast", "intermittent", "health", "benefit"]):
                articles.append(Article(title=line[:120]))

    result = ArticleResult(articles=articles[:request.max_results])

    print("\\n" + "=" * 60)
    print(f"Healthline: {request.query}")
    print("=" * 60)
    for i, a in enumerate(result.articles, 1):
        print(f"  {i}. {a.title}")
        if a.author:
            print(f"     Author: {a.author}")
        if a.date:
            print(f"     Date:   {a.date}")
        if a.summary:
            print(f"     {a.summary[:80]}...")
    print(f"\\nTotal: {len(result.articles)} articles")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("healthline_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = healthline_search(page, ArticleRequest())
            print(f"\\nReturned {len(result.articles)} articles")
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
    const searchUrl = `https://www.healthline.com/search?q1=${CFG.query.replace(/ /g, '+')}`;
    console.log(`\n🌐 Loading: ${searchUrl}...`);
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url: searchUrl, description: "Navigate to Healthline search" });

    const articles = await stagehand.extract(
      `extract up to ${CFG.maxResults} article results with title, author, publication date, and summary`
    );
    console.log("\n📊 Articles:", JSON.stringify(articles, null, 2));
    recorder.record("extract", { instruction: "Extract articles", results: articles });

    const dir = path.join(__dirname);
    fs.writeFileSync(path.join(dir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    console.log(`\n💾 Saved ${recorder.actions.length} actions`);

    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(dir, "healthline_search.py"), pyCode);
    console.log("🐍 Saved Python script");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
