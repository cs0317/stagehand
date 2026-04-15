const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Audible.com – Audiobook Search
 */

const CFG = {
  url: "https://www.audible.com",
  query: "science fiction",
  maxResults: 5,
  waits: { page: 3000, search: 5000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Audible.com – Audiobook Search
Query: ${cfg.query}
Max results: ${cfg.maxResults}

Generated on: ${ts}
Recorded ${n} browser interactions
"""

import re
import os, sys, shutil
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws


def run(
    playwright: Playwright,
    query: str = "${cfg.query}",
    max_results: int = ${cfg.maxResults},
) -> list:
    print(f"  Query: {query}")
    print(f"  Max results: {max_results}\\n")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("audible_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        # ── Navigate to search results ────────────────────────────────────
        search_query = query.replace(" ", "+")
        search_url = f"${cfg.url}/search?keywords={search_query}"
        print(f"Loading {search_url}...")
        page.goto(search_url)
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(5000)
        print(f"  Loaded: {page.url}")

        # ── Extract audiobooks ────────────────────────────────────────────
        print(f"Extracting up to {max_results} audiobooks...")

        # Audible product items: li.productListItem
        product_items = page.locator("li.productListItem")
        count = product_items.count()
        print(f"  Found {count} product items on page")

        for i in range(min(count, max_results)):
            item = product_items.nth(i)
            try:
                text = item.inner_text(timeout=3000)

                # Title from aria-label
                title = item.get_attribute("aria-label", timeout=2000) or "N/A"

                # Author: "By: AuthorName"
                author = "N/A"
                m = re.search(r"By:\\s*(.+?)\\n", text)
                if m:
                    author = m.group(1).strip()

                # Narrator: "Narrated by: NarratorName"
                narrator = "N/A"
                m = re.search(r"Narrated by:\\s*(.+?)\\n", text)
                if m:
                    narrator = m.group(1).strip()

                # Length: "Length: X hrs and Y mins"
                length = "N/A"
                m = re.search(r"Length:\\s*(.+?)\\n", text)
                if m:
                    length = m.group(1).strip()

                # Rating: a number like "4.2" followed by "X ratings"
                rating = "N/A"
                m = re.search(r"(\\d+\\.\\d+)\\s*\\n?\\s*\\d+\\s*ratings?", text)
                if m:
                    rating = m.group(1)

                if title == "N/A":
                    continue

                results.append({
                    "title": title,
                    "author": author,
                    "narrator": narrator,
                    "length": length,
                    "rating": rating,
                })
            except Exception:
                continue

        # ── Print results ─────────────────────────────────────────────────
        print(f"\\nFound {len(results)} audiobooks for '{query}':\\n")
        for i, book in enumerate(results, 1):
            print(f"  {i}. {book['title']}")
            print(f"     Author: {book['author']}")
            print(f"     Narrator: {book['narrator']}")
            print(f"     Length: {book['length']}")
            print(f"     Rating: {book['rating']}")
            print()

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

    return results


if __name__ == "__main__":
    with sync_playwright() as playwright:
        items = run(playwright)
        print(f"\\nTotal audiobooks found: {len(items)}")
`;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Audible.com – Audiobook Search");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  📝 Query: ${CFG.query}`);
  console.log(`  📊 Max results: ${CFG.maxResults}\n`);

  const recorder = new PlaywrightRecorder();
  const llmClient = setupLLMClient("hybrid");
  let stagehand;

  try {
    stagehand = new Stagehand({
      env: "LOCAL", verbose: 0, llmClient,
      localBrowserLaunchOptions: {
        headless: false,
        viewport: { width: 1920, height: 1080 },
        args: ["--disable-blink-features=AutomationControlled", "--start-maximized"],
      },
    });
    await stagehand.init();
    const page = stagehand.context.pages()[0];

    const searchQuery = CFG.query.replace(/ /g, "+");
    const searchUrl = `${CFG.url}/search?keywords=${searchQuery}`;
    console.log(`🌐 Loading ${searchUrl}...`);
    recorder.goto(searchUrl);
    await page.goto(searchUrl);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(CFG.waits.search);
    console.log("✅ Loaded\n");

    // Extract using AI
    const { z } = require("zod/v3");
    const listings = await stagehand.extract(
      `Extract up to ${CFG.maxResults} audiobook results. For each, get the title, author, narrator, length (e.g. "23 hrs and 23 mins"), and rating (e.g. "4.2").`,
      z.object({
        audiobooks: z.array(z.object({
          title: z.string().describe("Audiobook title"),
          author: z.string().describe("Author name"),
          narrator: z.string().describe("Narrator name"),
          length: z.string().describe("Duration, e.g. '23 hrs and 23 mins'"),
          rating: z.string().describe("Rating, e.g. '4.2'"),
        })).describe(`Up to ${CFG.maxResults} audiobooks`),
      })
    );

    recorder.record("extract", {
      instruction: "Extract audiobook search results",
      description: `Extract up to ${CFG.maxResults} audiobooks`,
      results: listings,
    });

    console.log(`📋 Found ${listings.audiobooks.length} audiobooks:`);
    listings.audiobooks.forEach((b, i) => {
      console.log(`   ${i + 1}. ${b.title}`);
      console.log(`      Author: ${b.author}  Narrator: ${b.narrator}`);
      console.log(`      Length: ${b.length}  Rating: ${b.rating}`);
    });

    const pyScript = genPython(CFG, recorder);
    const pyPath = path.join(__dirname, "audible_search.py");
    fs.writeFileSync(pyPath, pyScript, "utf-8");
    console.log(`\n✅ Python: ${pyPath}`);

    const jsonPath = path.join(__dirname, "recorded_actions.json");
    fs.writeFileSync(jsonPath, JSON.stringify(recorder.actions, null, 2), "utf-8");
    console.log(`📋 Actions: ${jsonPath}`);

    return listings;
  } catch (err) {
    console.error("\n❌ Error:", err.message);
    if (recorder?.actions.length > 0) {
      const pyScript = genPython(CFG, recorder);
      fs.writeFileSync(path.join(__dirname, "audible_search.py"), pyScript, "utf-8");
      console.log("⚠️  Partial Python saved");
    }
    throw err;
  } finally {
    if (stagehand) await stagehand.close();
  }
}

if (require.main === module) {
  main().then(() => { console.log("🎊 Done!"); process.exit(0); }).catch((e) => { console.error("💥", e.message); process.exit(1); });
}
module.exports = { main };
