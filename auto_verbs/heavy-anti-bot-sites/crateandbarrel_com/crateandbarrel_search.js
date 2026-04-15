/**
 * crateandbarrel_search.js – Stagehand explorer for Crate & Barrel
 *
 * Run:
 *   node verbs/crateandbarrel_com/crateandbarrel_search.js
 */

const { Stagehand } = require("@browserbasehq/stagehand");
const { z } = require("zod/v3");
const fs = require("fs");
const path = require("path");
const {
  PlaywrightRecorder,
  setupLLMClient,
} = require("../../stagehand-utils");

const QUERY       = "dining table";
const MAX_RESULTS = 5;

function genPython() {
  return `\
"""
Auto-generated Playwright script (Python)
Crate & Barrel – Product Search
Query: ${QUERY}   Max results: ${MAX_RESULTS}

Generated on: ${new Date().toISOString()}
"""

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
    profile_dir = get_temp_profile_dir("crateandbarrel_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        # ── Navigate ──────────────────────────────────────────────────
        print("Loading Crate & Barrel search results...")
        search_url = "https://www.crateandbarrel.com/search?query=" + query.replace(" ", "+")
        page.goto(search_url)
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(8000)
        print(f"  Loaded: {page.url}")

        # ── Extract products ──────────────────────────────────────────
        print(f"Extracting up to {max_results} products...")

        body_text = page.evaluate("document.body.innerText") or ""
        lines = [l.strip() for l in body_text.split("\\n") if l.strip()]

        # Pattern: "Save to Favorites" → Product Name → Price → (review_count)
        i = 0
        while i < len(lines) and len(results) < max_results:
            if lines[i] == "Save to Favorites" and i + 1 < len(lines):
                # Product name is the next meaningful line
                name = lines[i + 1]
                price = "N/A"
                rating = "N/A"
                dimensions = "N/A"

                # Extract dimensions from name if present
                dim_match = re.search(r'\\((\\d+["\\'\\-\\d.xX×\\s]+)\\)', name)
                if dim_match:
                    dimensions = dim_match.group(1)

                # Look ahead for price and reviews
                for k in range(i + 2, min(i + 10, len(lines))):
                    line = lines[k]
                    if line == "Save to Favorites":
                        break
                    if price == "N/A" and ("$" in line and re.search(r"\\$[\\d,]+\\.\\d{2}", line)):
                        price = line
                    if re.match(r"^\\([\\d,]+\\)$", line):
                        rating = line  # review count

                if name and price != "N/A":
                    results.append({
                        "name": name,
                        "price": price,
                        "dimensions": dimensions,
                        "reviews": rating,
                    })

            i += 1

        # ── Print results ─────────────────────────────────────────────
        print(f"\\nFound {len(results)} products:\\n")
        for i, p in enumerate(results, 1):
            print(f"  {i}. {p['name']}")
            print(f"     Price: {p['price']}  Dimensions: {p['dimensions']}  Reviews: {p['reviews']}")
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
        print(f"\\nTotal products found: {len(items)}")
`;
}

// ── Main ─────────────────────────────────────────────────────────────
(async () => {
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  Crate & Barrel – Product Search");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  🪑 Query      : " + QUERY);
  console.log("  📊 Max results: " + MAX_RESULTS);

  const llmClient = setupLLMClient("hybrid");
  const stagehand = new Stagehand({ env: "LOCAL", verbose: 0, llmClient });
  await stagehand.init();

  const page = stagehand.context.pages()[0];
  const recorder = new PlaywrightRecorder();

  const searchUrl = "https://www.crateandbarrel.com/search?query=" + QUERY.replace(/ /g, "+");
  console.log("\n🌐 Loading search results...");
  await page.goto(searchUrl);
  await page.waitForLoadState("domcontentloaded");
  await new Promise((r) => setTimeout(r, 8000));
  recorder.record("goto", "Navigate to " + searchUrl, { url: searchUrl });
  console.log("✅ Loaded\n");

  const ProductSchema = z.object({
    products: z.array(
      z.object({
        name: z.string(),
        price: z.string(),
        dimensions: z.string(),
        rating: z.string(),
      })
    ).max(MAX_RESULTS),
  });

  const data = await stagehand.extract(
    "Extract up to " + MAX_RESULTS + " dining tables. For each get the name, price, dimensions (from the name), and rating or review count. If no rating shown, use 'N/A'.",
    ProductSchema
  );
  recorder.record("extract", "Extract up to " + MAX_RESULTS + " products");

  console.log("📋 Found " + data.products.length + " products:");
  data.products.forEach((p, i) => {
    console.log("   " + (i + 1) + ". " + p.name);
    console.log("      Price: " + p.price + "  Dimensions: " + p.dimensions + "  Rating: " + p.rating);
  });

  const pyPath = path.join(__dirname, "crateandbarrel_search.py");
  fs.writeFileSync(pyPath, genPython(), "utf-8");
  console.log("\n✅ Python: " + pyPath);

  const actionsPath = path.join(__dirname, "recorded_actions.json");
  fs.writeFileSync(actionsPath, JSON.stringify(recorder.actions, null, 2), "utf-8");
  console.log("📋 Actions: " + actionsPath);

  await stagehand.close();
  console.log("🎊 Done!");
})();
