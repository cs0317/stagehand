const fs = require("fs");
const path = require("path");

/**
 * Project Gutenberg – Book Search
 *
 * The search-results page (/ebooks/search/?query=...) has very clean markup:
 *   li.booklink > a.link[href^="/ebooks/"]
 *     span.title    → book title
 *     span.subtitle → author
 *     span.extra    → "<N> downloads"
 *
 * The anchor's href carries the ebook ID (e.g. /ebooks/84 → id=84).
 * Selectors were discovered by direct HTML inspection — no AI exploration needed.
 */

const CFG = {
  baseUrl: "https://www.gutenberg.org",
  searchUrlTemplate: "https://www.gutenberg.org/ebooks/search/?query={q}",
  query: "frankenstein",
  maxResults: 5,
  waits: { page: 2000 },
  selectors: {
    book: "li.booklink",
    anchor: 'a.link[href^="/ebooks/"]',
    title: ".title",
    subtitle: ".subtitle",
    extra: ".extra",
  },
};

function genPython(cfg) {
  const ts = new Date().toISOString();
  return `"""
Auto-generated Playwright script (Python)
Project Gutenberg – Book Search
Query: ${cfg.query}

Generated on: ${ts}

Uses Playwright via CDP connection with the user's Chrome profile.
"""

import os, sys, shutil, re
from urllib.parse import quote
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws


def run(
    playwright: Playwright,
    query: str = "${cfg.query}",
    max_results: int = ${cfg.maxResults},
) -> list:
    print(f"  Query:       {query}")
    print(f"  Max results: {max_results}\\n")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("gutenberg_org")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    books = []

    try:
        search_url = f"https://www.gutenberg.org/ebooks/search/?query={quote(query)}"
        print(f"Loading search: {search_url}")
        page.goto(search_url)
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_selector("${cfg.selectors.book}", timeout=10000)
        page.wait_for_timeout(${cfg.waits.page})

        booklinks = page.locator("${cfg.selectors.book}")
        total = min(booklinks.count(), max_results)
        print(f"  Found {booklinks.count()} book results; extracting top {total}.")

        for i in range(total):
            li = booklinks.nth(i)

            anchor = li.locator('${cfg.selectors.anchor}').first
            href = anchor.get_attribute("href") or ""
            m = re.search(r"/ebooks/(\\d+)", href)
            ebook_id = m.group(1) if m else ""
            detail_url = f"https://www.gutenberg.org{href}" if href else ""

            title_el = li.locator("${cfg.selectors.title}").first
            title = title_el.inner_text(timeout=2000).strip() if title_el.count() > 0 else ""

            subtitle_el = li.locator("${cfg.selectors.subtitle}").first
            author = subtitle_el.inner_text(timeout=2000).strip() if subtitle_el.count() > 0 else ""

            extra_el = li.locator("${cfg.selectors.extra}").first
            extra_raw = extra_el.inner_text(timeout=2000).strip() if extra_el.count() > 0 else ""
            # "154206 downloads" → 154206
            dm = re.search(r"(\\d[\\d,]*)", extra_raw)
            download_count = int(dm.group(1).replace(",", "")) if dm else 0

            books.append({
                "title": title,
                "author": author,
                "ebook_id": ebook_id,
                "download_count": download_count,
                "detail_url": detail_url,
            })

        print(f"\\nTop {len(books)} Gutenberg results for '{query}':")
        for idx, b in enumerate(books, 1):
            print(f"\\n  [{idx}] {b['title']}")
            print(f"      Author:     {b['author']}")
            print(f"      Ebook ID:   {b['ebook_id']}")
            print(f"      Downloads:  {b['download_count']:,}")
            print(f"      Detail URL: {b['detail_url']}")

    except Exception as e:
        import traceback
        print(f"Error: {e}")
        traceback.print_exc()
    finally:
        try:
            browser.close()
        except Exception:
            pass
        chrome_proc.terminate()
        shutil.rmtree(profile_dir, ignore_errors=True)

    return books


if __name__ == "__main__":
    with sync_playwright() as playwright:
        results = run(playwright)
        print(f"\\n--- Summary ---")
        print(f"  Retrieved {len(results)} books.")
`;
}

if (require.main === module) {
  const out = genPython(CFG);
  const pyPath = path.join(__dirname, "gutenberg_search.py");
  fs.writeFileSync(pyPath, out);
  console.log(`Wrote ${pyPath}`);
}

module.exports = { CFG, genPython };
