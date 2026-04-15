const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient, observeAndAct } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");
const os = require("os");

const CFG = { url: "https://www.goodreads.com", author: "Isaac Asimov", maxResults: 5, waits: { page: 3000, type: 2000, search: 5000 } };

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  return `"""
Auto-generated Playwright script (Python)
Goodreads – Author Books
Author: ${cfg.author}
Generated on: ${ts}
"""

import re
import os, sys, shutil
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws


def run(
    playwright: Playwright,
    author: str = "${cfg.author}",
    max_results: int = ${cfg.maxResults},
) -> list:
    print(f"  Author: {author}")
    print(f"  Max results: {max_results}\\n")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("goodreads_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        print("Loading Goodreads...")
        page.goto("${cfg.url}")
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(2000)

        for selector in ["button:has-text('Accept')", "button:has-text('Close')"]:
            try:
                btn = page.locator(selector).first
                if btn.is_visible(timeout=1500): btn.evaluate("el => el.click()"); page.wait_for_timeout(500)
            except Exception: pass

        print(f'STEP 1: Search for author "{author}"...')
        search_input = page.locator(
            'input[name="q"], input[aria-label*="search" i], input[placeholder*="search" i]'
        ).first
        search_input.evaluate("el => el.click()")
        page.wait_for_timeout(500)
        page.keyboard.press("Control+a")
        search_input.type(author, delay=50)
        page.wait_for_timeout(1000)
        page.keyboard.press("Enter")
        page.wait_for_timeout(2000)
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(2000)

        print("STEP 2: Click on the author result...")
        try:
            author_link = page.locator(f'a:has-text("{author}")').first
            author_link.evaluate("el => el.click()")
            page.wait_for_timeout(2000)
        except Exception:
            print("  Could not find author link, staying on search results")

        print(f"STEP 3: Extract up to {max_results} top books...")
        book_rows = page.locator(
            'tr[itemtype*="Book"], div[class*="book"], [data-testid="book"]'
        )
        count = book_rows.count()
        print(f"  Found {count} book rows")

        for i in range(min(count, max_results)):
            row = book_rows.nth(i)
            try:
                title = "N/A"
                avg_rating = "N/A"
                num_ratings = "N/A"

                try:
                    title_el = row.locator('a[class*="title"], span[class*="title"], h3, h4').first
                    title = title_el.inner_text(timeout=2000).strip()
                except Exception: pass

                try:
                    rating_el = row.locator('[class*="rating"], [class*="average"]').first
                    avg_rating = rating_el.inner_text(timeout=2000).strip()
                    m = re.search(r"[\\d.]+", avg_rating)
                    if m: avg_rating = m.group(0)
                except Exception: pass

                try:
                    count_el = row.locator('[class*="ratings"], [class*="count"]').first
                    num_ratings = count_el.inner_text(timeout=2000).strip()
                except Exception: pass

                if title != "N/A":
                    results.append({"title": title, "avg_rating": avg_rating, "num_ratings": num_ratings})
                    print(f"  {len(results)}. {title} | Rating: {avg_rating} | Ratings: {num_ratings}")

            except Exception as e:
                print(f"  Error on row {i}: {e}")

        print(f"\\nTop {len(results)} books by '{author}':")
        for i, r in enumerate(results, 1):
            print(f"  {i}. {r['title']}")
            print(f"     Avg Rating: {r['avg_rating']}  Num Ratings: {r['num_ratings']}")

    except Exception as e:
        import traceback; print(f"Error: {e}"); traceback.print_exc()
    finally:
        try: browser.close()
        except Exception: pass
        chrome_proc.terminate()
        shutil.rmtree(profile_dir, ignore_errors=True)

    return results


if __name__ == "__main__":
    with sync_playwright() as playwright:
        items = run(playwright)
        print(f"\\nTotal books found: {len(items)}")
`;
}

async function main() {
  const recorder = new PlaywrightRecorder(); const llmClient = setupLLMClient("hybrid"); let stagehand;
  try {
    stagehand = new Stagehand({ env: "LOCAL", verbose: 0, llmClient, localBrowserLaunchOptions: { userDataDir: path.join(os.homedir(), "AppData", "Local", "Google", "Chrome", "User Data", "Default"), headless: false, viewport: { width: 1920, height: 1080 }, args: ["--disable-blink-features=AutomationControlled", "--disable-infobars", "--disable-extensions", "--start-maximized"] } });
    await stagehand.init(); const page = stagehand.context.pages()[0];
    await page.goto(CFG.url); await page.waitForLoadState("domcontentloaded"); await page.waitForTimeout(CFG.waits.page);
    await observeAndAct(stagehand, page, recorder, `Click the search input`, "Click search");
    await stagehand.act(`Type '${CFG.author}' and press Enter`);
    await page.waitForTimeout(CFG.waits.search);
    await stagehand.act(`Click on the author "${CFG.author}" in the results`);
    await page.waitForTimeout(CFG.waits.page);
    const { z } = require("zod/v3");
    const listings = await stagehand.extract(`Extract up to ${CFG.maxResults} top books by this author. Get title, average rating, and number of ratings.`,
      z.object({ books: z.array(z.object({ title: z.string(), avgRating: z.string(), numRatings: z.string() })) }));
    recorder.record("extract", { instruction: "Extract books", results: listings });
    fs.writeFileSync(path.join(__dirname, "goodreads_author.py"), genPython(CFG, recorder), "utf-8");
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2), "utf-8");
    return listings;
  } catch (err) { console.error("❌", err.message); if (recorder?.actions.length > 0) fs.writeFileSync(path.join(__dirname, "goodreads_author.py"), genPython(CFG, recorder), "utf-8"); throw err;
  } finally { if (stagehand) await stagehand.close(); }
}
if (require.main === module) { main().then(() => process.exit(0)).catch(() => process.exit(1)); }
module.exports = { main };
