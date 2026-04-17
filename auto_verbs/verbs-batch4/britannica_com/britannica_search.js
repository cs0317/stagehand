/**
 * Britannica – Article Search
 *
 * Prompt:
 *   Search for the encyclopedia article on "photosynthesis".
 *   Click on the top result.
 *   Extract the article title, introductory summary paragraph,
 *   and key facts or data points.
 *
 * Strategy:
 *   Direct URL: britannica.com/search?query=<term>
 *   Click the top result link, then extract article content.
 */

const { Stagehand } = require("@browserbasehq/stagehand");
const { z } = require("zod");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { setupLLMClient, PlaywrightRecorder, observeAndAct } = require("../../stagehand-utils");

const TIMEOUT = 150_000;
setTimeout(() => { console.error("\n⏰ Global timeout – exiting"); process.exit(1); }, TIMEOUT);

const CFG = {
  searchTerm: "photosynthesis",
  maxFacts: 10,
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Britannica – Article Search
Search for an encyclopedia article, click top result, extract content.

Generated on: ${ts}
Recorded ${n} browser interactions
"""

import re
import os
from dataclasses import dataclass
from urllib.parse import quote_plus
from playwright.sync_api import sync_playwright, Page

import sys as _sys
import os as _os
_sys.path.insert(0, _os.path.join(_os.path.dirname(__file__), ".."))
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class BritannicaSearchRequest:
    search_term: str = "${cfg.searchTerm}"
    max_facts: int = ${cfg.maxFacts}


@dataclass(frozen=True)
class BritannicaArticle:
    title: str = ""
    summary: str = ""
    facts: list = None  # list[str]
    url: str = ""


@dataclass(frozen=True)
class BritannicaSearchResult:
    article: BritannicaArticle = None


def britannica_search(page: Page, request: BritannicaSearchRequest) -> BritannicaSearchResult:
    search_term = request.search_term
    max_facts = request.max_facts
    print(f"  Search term: {search_term}")
    print(f"  Max facts: {max_facts}\\n")

    url = f"https://www.britannica.com/search?query={quote_plus(search_term)}"
    print(f"Loading {url}...")
    checkpoint(f"Navigate to search results for '{search_term}'")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(8000)
    print(f"  Loaded: {page.url}")

    checkpoint("Click the top search result")
    top_link = page.locator('a[href*="/topic/"], a[href*="/science/"], a[href*="/biography/"], a[href*="/place/"], a[href*="/technology/"], a[href*="/art/"], a[href*="/event/"]').first
    try:
        top_link.click(timeout=5000)
        page.wait_for_timeout(8000)
        print(f"  Navigated to article: {page.url}")
    except Exception:
        print("  WARNING: Could not click top result, trying direct topic URL...")
        fallback_url = f"https://www.britannica.com/search?query={quote_plus(search_term)}"
        checkpoint(f"Fallback: reload search for '{search_term}'")
        page.goto(fallback_url, wait_until="domcontentloaded")
        page.wait_for_timeout(8000)

    article_url = page.url
    body_text = page.evaluate("document.body ? document.body.innerText : ''") or ""
    lines = [l.strip() for l in body_text.split("\\n") if l.strip()]

    title = ""
    title_el = page.locator("h1").first
    try:
        title = title_el.inner_text(timeout=3000).strip()
    except Exception:
        for line in lines:
            if len(line) > 3 and len(line) < 200:
                title = line
                break
    print(f"  Title: {title}")

    summary = ""
    for line in lines:
        if len(line) > 100 and line != title:
            summary = line
            break

    facts = []
    fact_keywords = [
        r'\\d+\\s*%', r'\\d{4}', r'\\d+\\s*(million|billion|thousand|km|miles|kg|lb|meters|feet)',
        r'is\\s+(?:a|an|the)', r'was\\s+(?:a|an|the|born|discovered|founded)',
        r'known\\s+(?:as|for)', r'located\\s+in', r'discovered\\s+(?:by|in)',
    ]
    fact_pattern = re.compile('|'.join(fact_keywords), re.I)

    for line in lines:
        if len(facts) >= max_facts:
            break
        if 20 < len(line) < 500 and line != title and line != summary:
            if fact_pattern.search(line):
                facts.append(line)

    if len(facts) < 3:
        for line in lines:
            if len(facts) >= max_facts:
                break
            if 50 < len(line) < 500 and line != title and line != summary and line not in facts:
                facts.append(line)

    print("=" * 60)
    print(f"Britannica - {title}")
    print("=" * 60)
    print(f"\\nSummary:\\n  {summary[:300]}{'...' if len(summary) > 300 else ''}")
    print(f"\\nKey Facts ({len(facts)}):")
    for idx, fact in enumerate(facts, 1):
        print(f"  {idx}. {fact[:200]}{'...' if len(fact) > 200 else ''}")
    print(f"\\nURL: {article_url}")

    return BritannicaSearchResult(
        article=BritannicaArticle(
            title=title,
            summary=summary,
            facts=facts,
            url=article_url,
        )
    )


def test_func():
    import subprocess, time
    subprocess.call("taskkill /f /im chrome.exe", stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(2)
    chrome_user_data = os.path.join(
        os.environ["USERPROFILE"], "AppData", "Local", "Google", "Chrome", "User Data", "Default"
    )
    with sync_playwright() as pw:
        context = pw.chromium.launch_persistent_context(
            chrome_user_data,
            channel="chrome",
            headless=False,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--disable-infobars",
                "--disable-extensions",
            ],
        )
        page = context.pages[0] if context.pages else context.new_page()
        result = britannica_search(page, BritannicaSearchRequest())
        article = result.article
        print(f"\\nReturned article: {article.title if article else 'None'}")
        print(f"  Facts: {len(article.facts or []) if article else 0}")
        context.close()


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
`;
}

/* ── main ────────────────────────────────────────────────── */
(async () => {
  const stagehand = new Stagehand({
    env: "LOCAL",
    verbose: 1,
    localBrowserLaunchOptions: {
      headless: false,
      channel: "chrome",
      args: ["--disable-blink-features=AutomationControlled"],
    },
  });
  await stagehand.init();

  const page = stagehand.context.pages()[0];
  const recorder = new PlaywrightRecorder();

  try {
    const searchUrl = `https://www.britannica.com/search?query=${encodeURIComponent(CFG.searchTerm)}`;
    console.log("🌐 Navigating to Britannica search...");
    recorder.record("navigate", { url: searchUrl });
    await page.goto(searchUrl, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(5000);
    console.log(`   ✅ Loaded: ${page.url()}`);

    const bodyText = await page.evaluate(() => document.body?.innerText || "");
    if (bodyText.includes("CAPTCHA") || bodyText.includes("Access Denied")) {
      console.log("🚫 Bot detection triggered. Stopping.");
      process.exit(1);
    }

    console.log("🎯 Clicking top search result...");
    await stagehand.act("Click the first search result link");
    await page.waitForTimeout(5000);
    console.log(`   ✅ Article page: ${page.url()}`);

    console.log("🎯 Extracting article content...");
    const data = await stagehand.extract(
      `Extract the article title, introductory summary paragraph, and up to ${CFG.maxFacts} key facts or data points from this Britannica encyclopedia article.`,
      z.object({
        title: z.string(),
        summary: z.string(),
        facts: z.array(z.string()),
      })
    );

    console.log(`\n✅ Extracted article: ${data.title}`);
    console.log(`   Summary: ${data.summary.substring(0, 200)}...`);
    console.log(`   Facts: ${data.facts.length}`);

    const pyCode = genPython(CFG, recorder);
    const pyPath = path.join(__dirname, "britannica_search.py");
    fs.writeFileSync(pyPath, pyCode, "utf-8");
    console.log(`\n📄 Python script written to: ${pyPath}`);

    const actionsPath = path.join(__dirname, "recorded_actions.json");
    fs.writeFileSync(actionsPath, JSON.stringify(recorder.actions, null, 2), "utf-8");
    console.log(`📋 Recorded actions: ${actionsPath}`);

  } catch (err) {
    console.error("❌ Error:", err.message);
  } finally {
    await stagehand.close();
  }
})();
