const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * NYT Bestsellers – Fiction List
 *
 * Extracts top fiction bestsellers: rank, title, author, weeks on list, description.
 */

const CFG = {
  maxResults: 5,
  waits: { page: 6000, action: 2000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
NYT Bestsellers – Fiction List

Generated on: ${ts}
Recorded ${n} browser interactions
"""

import os, sys, re, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class Request:
    max_results: int = ${cfg.maxResults}


@dataclass
class Book:
    rank: int = 0
    title: str = ""
    author: str = ""
    weeks_on_list: str = ""
    description: str = ""


@dataclass
class Result:
    books: List[Book] = field(default_factory=list)


def nyt_bestsellers(page: Page, request: Request) -> Result:
    """Extract top fiction bestsellers from NYT."""

    page.goto("https://www.nytimes.com/books/best-sellers", wait_until="domcontentloaded")
    page.wait_for_timeout(${cfg.waits.page})

    raw = page.evaluate(r"""(max) => {
        const ols = document.querySelectorAll('ol');
        if (!ols.length) return [];
        const ol = ols[0];
        const lis = ol.querySelectorAll(':scope > li');
        const results = [];
        for (let i = 0; i < Math.min(lis.length, max); i++) {
            const text = lis[i].innerText.trim();
            const lines = text.split('\\n').map(l => l.trim()).filter(l => l);
            const weeks = lines[0] || '';
            const title = lines[1] || '';
            const authorLine = lines[2] || '';
            const author = authorLine.replace(/^by\\s+/i, '');
            const desc = lines.slice(3).filter(l => !l.startsWith('BUY')).join(' ');
            results.push({ rank: i + 1, title, author, weeks_on_list: weeks, description: desc });
        }
        return results;
    }""", request.max_results)

    result = Result()
    for item in raw:
        result.books.append(Book(
            rank=item.get("rank", 0),
            title=item.get("title", ""),
            author=item.get("author", ""),
            weeks_on_list=item.get("weeks_on_list", ""),
            description=item.get("description", ""),
        ))
    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("nyt_bestsellers")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            req = Request()
            result = nyt_bestsellers(page, req)
            print(f"\\n=== DONE ===")
            print(f"Found {len(result.books)} books\\n")
            for b in result.books:
                print(f"  #{b.rank}: {b.title}")
                print(f"    Author:  {b.author}")
                print(f"    Weeks:   {b.weeks_on_list}")
                print(f"    Summary: {b.description[:120]}...")
                print()
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
  const stagehand = new Stagehand({
    env: "LOCAL",
    verbose: 0,
    llmClient: setupLLMClient(),
  });
  await stagehand.init();
  const recorder = new PlaywrightRecorder("nyt_bestsellers");
  const page = stagehand.context.pages()[0];

  try {
    const url = "https://www.nytimes.com/books/best-sellers";
    recorder.recordAction("navigate", { url });
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(CFG.waits.page);

    const books = await stagehand.extract(
      \`extract the first \${CFG.maxResults} fiction bestseller books with rank, title, author, weeks on list, and description\`
    );
    console.log("Extracted:", JSON.stringify(books, null, 2));

    const outDir = path.dirname(__filename);
    fs.writeFileSync(
      path.join(outDir, "recorded_actions.json"),
      JSON.stringify(recorder.actions, null, 2)
    );
    fs.writeFileSync(
      path.join(outDir, "nyt_bestsellers.py"),
      genPython(CFG, recorder)
    );
    console.log("Files saved.");
  } finally {
    await stagehand.close();
  }
})();
