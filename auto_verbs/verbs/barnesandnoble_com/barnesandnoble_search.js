/**
 * barnesandnoble_search.js – Stagehand explorer for Barnes & Noble
 *
 * Run:
 *   node verbs/barnesandnoble_com/barnesandnoble_search.js
 */

const { Stagehand } = require("@browserbasehq/stagehand");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");
const {
  PlaywrightRecorder,
  setupLLMClient,
  observeAndAct,
} = require("../../stagehand-utils");

// ── Configurable parameters ──────────────────────────────────────────
const QUERY       = "Brandon Sanderson";
const MAX_RESULTS = 5;

// ── Python generation ────────────────────────────────────────────────
function genPython() {
  return `\
\"\"\"
Auto-generated Playwright script (Python)
Barnes & Noble – Book Search
Query: ${QUERY}   Max results: ${MAX_RESULTS}

Generated on: ${new Date().toISOString()}
\"\"\"

import re
import os, sys, shutil
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws


def run(
    playwright: Playwright,
    query: str = "${QUERY}",
    max_results: int = ${MAX_RESULTS},
) -> list:
    print(f"  Query: {query}  Max results: {max_results}\\n")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("barnesandnoble_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        # ── Navigate ──────────────────────────────────────────────────
        print("Loading Barnes & Noble search results...")
        search_url = "https://www.barnesandnoble.com/s/" + query.replace(" ", "+")
        page.goto(search_url)
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(5000)
        print(f"  Loaded: {page.url}")

        # ── Extract books ─────────────────────────────────────────────
        print(f"Extracting up to {max_results} books...")

        tiles = page.query_selector_all(".product-shelf-tile")
        for tile in tiles[:max_results]:
            # Title from the <a title="..."> link
            link = tile.query_selector("a[title]")
            title = link.get_attribute("title") if link else "N/A"

            # Format from .format span
            fmt_el = tile.query_selector(".product-shelf-pricing .format")
            fmt = fmt_el.inner_text().strip() if fmt_el else "N/A"

            # Price from current price span (not .format, not .previous)
            price = "N/A"
            price_spans = tile.query_selector_all(".product-shelf-pricing .current a span")
            for sp in price_spans:
                txt = sp.inner_text().strip()
                if txt.startswith("$"):
                    price = txt
                    break

            # Rating: not shown in search results — mark N/A
            rating = "N/A"

            results.append({
                "title": title,
                "format": fmt,
                "price": price,
                "rating": rating,
            })

        # ── Print results ─────────────────────────────────────────────
        print(f"\\nFound {len(results)} books:\\n")
        for i, book in enumerate(results, 1):
            print(f"  {i}. {book['title']}")
            print(f"     Format: {book['format']}  Price: {book['price']}  Rating: {book['rating']}")
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
        print(f"\\nTotal books found: {len(items)}")
`;
}

// ── Main ─────────────────────────────────────────────────────────────
(async () => {
  const banner = `
═══════════════════════════════════════════════════════════════
  Barnes & Noble – Book Search
═══════════════════════════════════════════════════════════════
  📖 Query      : ${QUERY}
  📊 Max results: ${MAX_RESULTS}`;
  console.log(banner);

  /* LLM */
  const llmClient = setupLLMClient("hybrid");

  /* Stagehand */
  const stagehand = new Stagehand({
    env: "LOCAL",
    verbose: 0,
    llmClient,
  });
  await stagehand.init();

  const page = stagehand.context.pages()[0];
  const recorder = new PlaywrightRecorder();

  // ── Navigate to search results ────────────────────────────────────
  const searchUrl =
    `https://www.barnesandnoble.com/s/${QUERY.replace(/ /g, "+")}`;
  console.log("\n🌐 Loading Barnes & Noble search results...");
  await page.goto(searchUrl);
  await page.waitForLoadState("networkidle");
  await new Promise((r) => setTimeout(r, 5000));
  recorder.record("goto", `Navigate to ${searchUrl}`, { url: searchUrl });
  console.log("✅ Loaded\n");

  // ── Extract with AI ───────────────────────────────────────────────
  const BookSchema = z.object({
    books: z.array(
      z.object({
        title: z.string(),
        format: z.string(),
        price: z.string(),
        rating: z.string(),
      })
    ).max(MAX_RESULTS),
  });

  const data = await stagehand.extract(
    `Extract up to ${MAX_RESULTS} books. For each book get the title, format (Paperback/Hardcover/etc), price, and rating (or "N/A" if not shown).`,
    BookSchema
  );
  recorder.record("extract", `Extract up to ${MAX_RESULTS} books`);

  console.log(`📋 Found ${data.books.length} books:`);
  data.books.forEach((b, i) => {
    console.log(`   ${i + 1}. ${b.title}`);
    console.log(`      Format: ${b.format}  Price: ${b.price}  Rating: ${b.rating}`);
  });

  // ── Save Python & actions ─────────────────────────────────────────
  const pyPath = path.join(__dirname, "barnesandnoble_search.py");
  fs.writeFileSync(pyPath, genPython(), "utf-8");
  console.log(`\n✅ Python: ${pyPath}`);

  const actionsPath = path.join(__dirname, "recorded_actions.json");
  fs.writeFileSync(actionsPath, JSON.stringify(recorder.actions, null, 2), "utf-8");
  console.log(`📋 Actions: ${actionsPath}`);

  await stagehand.close();
  console.log("🎊 Done!");
})();
