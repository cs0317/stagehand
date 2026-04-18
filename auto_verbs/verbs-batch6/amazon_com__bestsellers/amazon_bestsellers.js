const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  category: "Books",
  maxBooks: 5,
  waits: { page: 5000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Amazon – Best Sellers (Books)
Category: "${cfg.category}"

Generated on: ${ts}
Recorded ${n} browser interactions
"""

import re
import os, sys, shutil
from dataclasses import dataclass, field
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class BestsellersRequest:
    category: str = "${cfg.category}"
    max_books: int = ${cfg.maxBooks}


@dataclass
class Book:
    rank: str = ""
    title: str = ""
    author: str = ""
    price: str = ""
    rating: str = ""


@dataclass
class BestsellersResult:
    books: list = field(default_factory=list)


def amazon_bestsellers(page: Page, request: BestsellersRequest) -> BestsellersResult:
    """Get Amazon Best Sellers in Books."""
    print(f"  Category: {request.category}\\n")

    url = "https://www.amazon.com/best-sellers-books-Amazon/zgbs/books"
    print(f"Loading {url}...")
    checkpoint("Navigate to Amazon Best Sellers Books")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    checkpoint("Extract bestseller books")
    books_data = page.evaluate(r"""(maxBooks) => {
        const results = [];
        const items = document.querySelectorAll(
            '[id^="gridItemRoot"], .zg-grid-general-faceout, .a-list-item'
        );
        let rank = 1;
        for (const item of items) {
            if (results.length >= maxBooks) break;
            const text = item.innerText || '';
            const lines = text.split('\\n').map(l => l.trim()).filter(Boolean);

            let title = '', author = '', price = '', rating = '';

            // Find title - usually longest line that isn't price
            for (const line of lines) {
                if (line.length > 10 && line.length < 200 && !/^\\$/.test(line) && !title) {
                    title = line;
                }
            }
            if (!title) continue;

            // Author
            for (const line of lines) {
                if (line !== title && line.length > 3 && line.length < 80 && !/^\\$|^\\d/.test(line) && !/stars?/i.test(line)) {
                    author = line;
                    break;
                }
            }

            // Price
            for (const line of lines) {
                const pm = line.match(/\\$(\\d+\\.\\d{2})/);
                if (pm) { price = pm[0]; break; }
            }

            // Rating
            for (const line of lines) {
                const rm = line.match(/(\\d+\\.\\d)\\s*out of/);
                if (rm) { rating = rm[1]; break; }
            }

            results.push({
                rank: String(rank),
                title,
                author,
                price,
                rating
            });
            rank++;
        }
        return results;
    }""", request.max_books)

    result = BestsellersResult(books=[Book(**b) for b in books_data])

    print("\\n" + "=" * 60)
    print(f"Amazon Best Sellers: {request.category}")
    print("=" * 60)
    for b in result.books:
        print(f"  #{b.rank} {b.title}")
        print(f"      Author: {b.author}  Price: {b.price}  Rating: {b.rating}")
    print(f"\\n  Total: {len(result.books)} books")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("amazon_bestsellers")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = amazon_bestsellers(page, BestsellersRequest())
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
    const url = "https://www.amazon.com/best-sellers-books-Amazon/zgbs/books";
    console.log(`\n🌐 Loading: ${url}...`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url, description: "Navigate to Amazon Best Sellers Books" });

    const booksData = await stagehand.extract(
      "extract the top 5 best-selling books with rank, title, author, price, and rating"
    );
    console.log("\n📊 Books:", JSON.stringify(booksData, null, 2));
    recorder.record("extract", { instruction: "Extract bestsellers", results: booksData });

    const dir = path.join(__dirname);
    fs.writeFileSync(path.join(dir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    console.log(`\n💾 Saved ${recorder.actions.length} actions`);

    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(dir, "amazon_bestsellers.py"), pyCode);
    console.log("🐍 Saved Python script");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
