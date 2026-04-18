const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  query: "calculus",
  maxResults: 5,
  waits: { page: 5000, action: 2000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
OpenStax – Textbook Search
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
class BookRequest:
    query: str = "${cfg.query}"
    max_results: int = ${cfg.maxResults}


@dataclass
class Book:
    title: str = ""
    subject: str = ""
    url: str = ""


@dataclass
class BookResult:
    books: List[Book] = field(default_factory=list)


def openstax_search(page: Page, request: BookRequest) -> BookResult:
    """Search OpenStax for textbooks via Google site search."""
    print(f"  Query: {request.query}\\n")

    from urllib.parse import quote_plus
    url = f"https://www.google.com/search?q=site%3Aopenstax.org+{quote_plus(request.query)}+textbook"
    print(f"Loading {url}...")
    checkpoint("Navigate to Google site search for OpenStax")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(3000)

    checkpoint("Extract book listings from Google results")
    books_data = page.evaluate(r\\"\\"\\"(maxResults) => {
        const results = [];
        const seen = new Set();
        const h3s = document.querySelectorAll('h3');
        for (const h of h3s) {
            if (results.length >= maxResults) break;
            let text = h.innerText.trim();
            text = text.replace(/\\s*[\\|\\u2013\\u2014-]\\s*OpenStax.*$/i, '').trim();
            if (text.length < 3 || seen.has(text)) continue;
            seen.add(text);

            let url = '';
            const link = h.closest('a') || h.parentElement?.closest('a');
            if (link) url = link.href || '';

            results.push({ title: text.slice(0, 120), subject: '', url });
        }
        return results;
    }\\"\\"\\"", request.max_results)

    books = [Book(**d) for d in books_data]
    result = BookResult(books=books[:request.max_results])

    print("\\n" + "=" * 60)
    print(f"OpenStax: {request.query}")
    print("=" * 60)
    for i, b in enumerate(result.books, 1):
        print(f"  {i}. {b.title}")
        if b.subject:
            print(f"     Subject: {b.subject}")
        if b.url:
            print(f"     URL:     {b.url}")
    print(f"\\nTotal: {len(result.books)} books")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("openstax_org")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = openstax_search(page, BookRequest())
            print(f"\\nReturned {len(result.books)} books")
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
    const searchUrl = `https://www.google.com/search?q=site%3Aopenstax.org+${encodeURIComponent(CFG.query)}+textbook`;
    console.log(`\n🌐 Loading: ${searchUrl}...`);
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url: searchUrl, description: "Navigate to Google site search for OpenStax" });

    const books = await stagehand.extract(
      `extract up to ${CFG.maxResults} textbooks with title, subject, and URL`
    );
    console.log("\n📊 Books:", JSON.stringify(books, null, 2));
    recorder.record("extract", { instruction: "Extract books", results: books });

    const dir = path.join(__dirname);
    fs.writeFileSync(path.join(dir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    console.log(`\n💾 Saved ${recorder.actions.length} actions`);

    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(dir, "openstax_search.py"), pyCode);
    console.log("🐍 Saved Python script");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
