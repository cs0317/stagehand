const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * TripAdvisor – Restaurant Search
 *
 * Uses Google redirect to bypass TripAdvisor challenge pages.
 * Parses body text for numbered restaurant entries.
 */

const CFG = {
  destination: "New Orleans, LA",
  maxResults: 5,
  waits: { page: 2000, search: 6000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Playwright script (Python) — TripAdvisor Restaurant Search
Search for restaurants by city and extract name, cuisine, rating, and price level.

Uses Google redirect to bypass TripAdvisor challenge pages
(same approach as verbs-batch2/tripadvisor_com/tripadvisor_hotels.py).

Generated on: ${ts}
Recorded ${n} browser interactions
"""

import re
import os
import sys
import shutil
import urllib.parse
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws


def run(
    playwright: Playwright,
    destination: str = "${cfg.destination}",
    max_results: int = ${cfg.maxResults},
) -> list:
    print(f"  Destination: {destination}")
    print(f"  Max results: {max_results}\\n")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("tripadvisor_restaurants")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        # ── Navigate via Google redirect ──────────────────────────────────
        google_q = urllib.parse.quote(f"site:tripadvisor.com Restaurants {destination}")
        google_url = f"https://www.google.com/search?q={google_q}"
        print(f"Loading Google: {google_url}...")
        page.goto(google_url, timeout=30000)
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(2000)

        links = page.locator('a[href*="tripadvisor.com/Restaurants-"]')
        lc = links.count()
        print(f"  Found {lc} TripAdvisor restaurant links")

        if lc == 0:
            print("  No TripAdvisor links found on Google. Aborting.")
            return results

        href = links.first.get_attribute("href", timeout=5000)
        print(f"  Navigating to TripAdvisor...")
        page.goto(href, timeout=30000)
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(2000)

        if page.title() == "tripadvisor.com":
            print("  Challenge page detected, reloading...")
            page.reload()
            page.wait_for_load_state("domcontentloaded")
            page.wait_for_timeout(2000)

        print(f"  Loaded: {page.title()}")

        # ── Extract restaurants via body text parsing ─────────────────────
        print(f"\\nExtracting up to {max_results} restaurants...")

        body = page.locator("body").inner_text(timeout=5000)
        lines = [l.strip() for l in body.split("\\n") if l.strip()]

        i = 0
        while i < len(lines) and len(results) < max_results:
            m = re.match(r"^\\d+\\.\\s+(.+)$", lines[i])
            if m:
                name = m.group(1).strip()
                if i + 1 < len(lines) and re.match(r"^\\d\\.\\d$", lines[i + 1]):
                    rating = lines[i + 1]
                    cuisine = "N/A"
                    if i + 3 < len(lines):
                        cand = lines[i + 3]
                        if not cand.startswith("$") and not re.match(r"^\\d", cand):
                            cuisine = cand
                    price_level = "N/A"
                    if i + 4 < len(lines):
                        cand = lines[i + 4]
                        if re.match(r"^\\$", cand):
                            price_level = cand
                    if cuisine != "N/A" and " • " in cuisine:
                        parts = cuisine.split(" • ", 1)
                        cuisine = parts[0].strip()
                        price_level = parts[1].strip()

                    results.append({
                        "name": name,
                        "cuisine": cuisine,
                        "rating": rating,
                        "price_level": price_level,
                    })
                    i += 5
                    continue
            i += 1

        print(f'\\nFound {len(results)} restaurants in "{destination}":\\n')
        for idx, r in enumerate(results, 1):
            print(f"  {idx}. {r['name']}")
            print(f"     Cuisine: {r['cuisine']}  Rating: {r['rating']}  Price: {r['price_level']}")
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
        print(f"\\nTotal restaurants found: {len(items)}")
`;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  TripAdvisor – Restaurant Search");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(\`  🍽️  Destination: \${CFG.destination}\`);
  console.log(\`  📊 Max results: \${CFG.maxResults}\\n\`);

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

    const googleQ = encodeURIComponent(\`site:tripadvisor.com Restaurants \${CFG.destination}\`);
    const googleUrl = \`https://www.google.com/search?q=\${googleQ}\`;
    console.log(\`🌐 Loading Google: \${googleUrl}...\`);
    recorder.goto(googleUrl);
    await page.goto(googleUrl);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(CFG.waits.page);

    const { z } = require("zod/v3");
    const listings = await stagehand.extract(
      \`Extract up to \${CFG.maxResults} restaurants from TripAdvisor. For each, get restaurant name, cuisine type, rating (out of 5), and price level ($ to $$$$).\`,
      z.object({
        restaurants: z.array(z.object({
          name: z.string().describe("Restaurant name"),
          cuisine: z.string().describe("Cuisine type, e.g. 'American, Cajun & Creole'"),
          rating: z.string().describe("Rating out of 5, e.g. '4.4'"),
          priceLevel: z.string().describe("Price level, e.g. '$$ - $$$'"),
        })).describe(\`Up to \${CFG.maxResults} restaurants\`),
      })
    );

    recorder.record("extract", {
      instruction: "Extract restaurant listings",
      description: \`Extract up to \${CFG.maxResults} restaurants\`,
      results: listings,
    });

    console.log(\`📋 Found \${listings.restaurants.length} restaurants:\`);
    listings.restaurants.forEach((r, i) => {
      console.log(\`   \${i + 1}. \${r.name}\`);
      console.log(\`      Cuisine: \${r.cuisine}  Rating: \${r.rating}  Price: \${r.priceLevel}\`);
    });

    const pyScript = genPython(CFG, recorder);
    const pyPath = path.join(__dirname, "tripadvisor_restaurants.py");
    fs.writeFileSync(pyPath, pyScript, "utf-8");
    console.log(\`\\n✅ Python: \${pyPath}\`);

    const jsonPath = path.join(__dirname, "recorded_actions.json");
    fs.writeFileSync(jsonPath, JSON.stringify(recorder.actions, null, 2), "utf-8");
    console.log(\`📋 Actions: \${jsonPath}\`);

    return listings;
  } catch (err) {
    console.error("\\n❌ Error:", err.message);
    if (recorder?.actions.length > 0) {
      const pyScript = genPython(CFG, recorder);
      fs.writeFileSync(path.join(__dirname, "tripadvisor_restaurants.py"), pyScript, "utf-8");
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
