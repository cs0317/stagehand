const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  query: "science fiction dystopia",
  maxResults: 5,
  waits: { page: 5000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
LibraryThing – Book Search
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
    author: str = ""
    rating: str = ""
    members: str = ""
    url: str = ""


@dataclass
class BookResult:
    books: List[Book] = field(default_factory=list)


def librarything_search(page: Page, request: BookRequest) -> BookResult:
    """Search LibraryThing for books."""
    print(f"  Query: {request.query}\\n")

    url = f"https://www.librarything.com/search?search={request.query.replace(' ', '+')}&searchtype=newwork_merged"
    print(f"Loading {url}...")
    checkpoint("Navigate to LibraryThing search")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    checkpoint("Extract book results")
    books = []

    rows = page.locator("table.lt_table tr, div.bookSearchResult, div[class*='searchResult']").all()
    for row in rows[:request.max_results + 2]:
        try:
            text = row.inner_text().strip()
            if not text or len(text) < 10:
                continue
            lines = [l.strip() for l in text.split("\\n") if l.strip()]
            title = ""
            author = ""
            rating = ""
            members = ""
            book_url = ""

            for line in lines:
                if not title and len(line) > 3 and not re.match(r"^\\d+$", line):
                    title = line
                elif title and not author and len(line) > 2:
                    if not re.match(r"^[\\d.]+$", line):
                        author = line
                rm = re.search(r"(\\d+\\.\\d+)\\s*(?:/|star|rating)", line, re.IGNORECASE)
                if rm:
                    rating = rm.group(1)
                mm = re.search(r"(\\d[\\d,]*)\\s*(?:member|cop|own)", line, re.IGNORECASE)
                if mm:
                    members = mm.group(1)

            try:
                link = row.locator("a").first
                href = link.get_attribute("href") or ""
                if href and "/work/" in href:
                    book_url = "https://www.librarything.com" + href if href.startswith("/") else href
            except Exception:
                pass

            if title and len(title) > 3:
                books.append(Book(title=title[:120], author=author[:60], rating=rating, members=members, url=book_url))
        except Exception:
            pass

    if not books:
        body_text = page.evaluate("document.body.innerText") or ""
        lines = [l.strip() for l in body_text.split("\\n") if l.strip() and len(l.strip()) > 10]
        for line in lines:
            if any(kw in line.lower() for kw in ["fiction", "dystop", "novel"]):
                books.append(Book(title=line[:120]))
                if len(books) >= request.max_results:
                    break

    result = BookResult(books=books[:request.max_results])

    print("\\n" + "=" * 60)
    print(f"LibraryThing: {request.query}")
    print("=" * 60)
    for i, b in enumerate(result.books, 1):
        print(f"  {i}. {b.title}")
        if b.author:
            print(f"     Author:  {b.author}")
        if b.rating:
            print(f"     Rating:  {b.rating}")
        if b.members:
            print(f"     Members: {b.members}")
        if b.url:
            print(f"     URL:     {b.url}")
    print(f"\\nTotal: {len(result.books)} books")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("librarything_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = librarything_search(page, BookRequest())
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
    const searchUrl = `https://www.librarything.com/search?search=${encodeURIComponent(CFG.query)}&searchtype=newwork_merged`;
    console.log(`\n🌐 Loading: ${searchUrl}...`);
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url: searchUrl, description: "Navigate to LibraryThing search" });

    const books = await stagehand.extract(
      `extract up to ${CFG.maxResults} books with title, author, average rating, number of members, and book URL`
    );
    console.log("\n📊 Books:", JSON.stringify(books, null, 2));
    recorder.record("extract", { instruction: "Extract books", results: books });

    const dir = path.join(__dirname);
    fs.writeFileSync(path.join(dir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    console.log(`\n💾 Saved ${recorder.actions.length} actions`);

    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(dir, "librarything_search.py"), pyCode);
    console.log("🐍 Saved Python script");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
