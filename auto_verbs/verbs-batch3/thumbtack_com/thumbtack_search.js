const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Thumbtack – Service Professional Search
 *
 * Navigates to Thumbtack's category page for a given service and location.
 * Extracts professional name, rating, review count, and starting price.
 */

const CFG = {
  url: "https://www.thumbtack.com",
  service: "house cleaning",
  location: "Portland, OR",
  maxResults: 5,
  waits: { page: 2000, search: 5000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Playwright script (Python) — Thumbtack Service Professional Search
Search for local service professionals by category and location.
Extract name, rating, number of reviews, and starting price.

URL pattern: https://www.thumbtack.com/{state}/{city}/{service-slug}/

Generated on: ${ts}
Recorded ${n} browser interactions
"""

import re
import os
import sys
import shutil
from playwright.sync_api import Playwright, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws


def run(
    playwright: Playwright,
    service: str = "${cfg.service}",
    location: str = "${cfg.location}",
    max_results: int = ${cfg.maxResults},
) -> list:
    print(f"  Service: {service}")
    print(f"  Location: {location}")
    print(f"  Max results: {max_results}\\n")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("thumbtack_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        loc_parts = [p.strip() for p in location.split(",")]
        city = loc_parts[0].lower().replace(" ", "-")
        state = loc_parts[1].lower().strip() if len(loc_parts) > 1 else ""
        service_slug = service.lower().replace(" ", "-")

        search_url = f"${cfg.url}/{state}/{city}/{service_slug}/"
        print(f"Loading {search_url}...")
        page.goto(search_url, timeout=30000)
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(2000)
        print(f"  Loaded: {page.url}")

        try:
            page.locator('[data-testid="pro-list-result-review"]').first.wait_for(
                state="visible", timeout=10000
            )
        except Exception:
            pass
        page.wait_for_timeout(2000)

        print(f"\\nExtracting up to {max_results} professionals...")

        body = page.locator("body").inner_text(timeout=5000)
        lines = [l.strip() for l in body.split("\\n") if l.strip()]

        rating_re = re.compile(r"^(?:Excellent|Great|Exceptional|Good|OK)\\s+(\\d\\.\\d)$")
        i = 0
        while i < len(lines) and len(results) < max_results:
            rm = rating_re.match(lines[i])
            if rm:
                rating = rm.group(1)
                name = "N/A"
                for delta in [1, 2]:
                    idx = i - delta
                    if idx >= 0:
                        cand = lines[idx]
                        if cand not in (
                            "Top Pro", "New on Thumbtack", "Recommended",
                            "Highest rated", "Most hires", "Fastest response",
                            "View profile", "See more",
                        ) and len(cand) > 2 and not rating_re.match(cand):
                            name = re.sub(r"^\\d+\\.\\s+", "", cand)
                            break

                reviews = "N/A"
                if i + 1 < len(lines):
                    rvm = re.match(r"^\\((\\d+)\\)$", lines[i + 1])
                    if rvm:
                        reviews = rvm.group(1)

                price = "N/A"

                if name != "N/A":
                    results.append({
                        "name": name,
                        "rating": rating,
                        "reviews": reviews,
                        "price": price,
                    })
                i += 2
                continue
            i += 1

        print(f'\\nFound {len(results)} professionals for "{service}" in {location}:\\n')
        for idx, p in enumerate(results, 1):
            print(f"  {idx}. {p['name']}")
            print(f"     Rating: {p['rating']}  Reviews: {p['reviews']}  Price: {p['price']}")
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
        print(f"\\nTotal professionals found: {len(items)}")
`;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Thumbtack – Service Professional Search");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(\`  🔧 Service: \${CFG.service}  Location: \${CFG.location}\`);
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

    const locParts = CFG.location.split(",").map(s => s.trim());
    const city = locParts[0].toLowerCase().replace(/ /g, "-");
    const state = (locParts[1] || "").toLowerCase();
    const serviceSlug = CFG.service.toLowerCase().replace(/ /g, "-");
    const searchUrl = \`\${CFG.url}/\${state}/\${city}/\${serviceSlug}/\`;

    console.log(\`🌐 Loading \${searchUrl}...\`);
    recorder.goto(searchUrl);
    await page.goto(searchUrl);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(CFG.waits.search);
    console.log("✅ Loaded\\n");

    const { z } = require("zod/v3");
    const listings = await stagehand.extract(
      \`Extract up to \${CFG.maxResults} service professionals. For each, get the name, rating (out of 5), number of reviews, and starting price.\`,
      z.object({
        professionals: z.array(z.object({
          name: z.string().describe("Professional or business name"),
          rating: z.string().describe("Rating, e.g. '4.9'"),
          reviews: z.string().describe("Number of reviews, e.g. '213'"),
          price: z.string().describe("Starting price or 'N/A'"),
        })).describe(\`Up to \${CFG.maxResults} professionals\`),
      })
    );

    recorder.record("extract", {
      instruction: "Extract service professionals",
      description: \`Extract up to \${CFG.maxResults} professionals\`,
      results: listings,
    });

    console.log(\`📋 Found \${listings.professionals.length} professionals:\`);
    listings.professionals.forEach((p, i) => {
      console.log(\`   \${i + 1}. \${p.name}\`);
      console.log(\`      Rating: \${p.rating}  Reviews: \${p.reviews}  Price: \${p.price}\`);
    });

    const pyScript = genPython(CFG, recorder);
    const pyPath = path.join(__dirname, "thumbtack_search.py");
    fs.writeFileSync(pyPath, pyScript, "utf-8");
    console.log(\`\\n✅ Python: \${pyPath}\`);

    const jsonPath = path.join(__dirname, "recorded_actions.json");
    fs.writeFileSync(jsonPath, JSON.stringify(recorder.actions, null, 2), "utf-8");
    console.log(\`📋 Actions: \${jsonPath}\`);

    return listings;
  } catch (err) {
    console.error("\\n❌ Error:", err.message);
    throw err;
  } finally {
    if (stagehand) await stagehand.close();
  }
}

if (require.main === module) {
  main().then(() => { console.log("🎊 Done!"); process.exit(0); }).catch((e) => { console.error("💥", e.message); process.exit(1); });
}
module.exports = { main };
