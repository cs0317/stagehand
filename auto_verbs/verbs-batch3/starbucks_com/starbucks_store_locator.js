const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Starbucks – Store Locator
 *
 * Searches for Starbucks stores near a given location.
 * Extracts store name, address, hours, distance, and features.
 */

const CFG = {
  url: "https://www.starbucks.com/store-locator",
  location: "Manhattan, NY",
  maxResults: 5,
  waits: { page: 3000, search: 8000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Playwright script (Python) — Starbucks Store Locator
Find stores near a given location.
Extract store name, address, hours, distance, and available features.

URL: https://www.starbucks.com/store-locator

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


HOURS_RE = re.compile(
    r"^([\\d.]+)\\s+miles?\\s+away\\s+·\\s+(.+)$"
)


def run(
    playwright: Playwright,
    location: str = "${cfg.location}",
    max_results: int = ${cfg.maxResults},
) -> list:
    print(f"  Location: {location}")
    print(f"  Max results: {max_results}\\n")

    port = get_free_port()
    profile_dir = get_temp_profile_dir("starbucks_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        page.goto("${cfg.url}", timeout=30000)
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(3000)

        try:
            page.locator('button:has-text("Agree")').first.click(timeout=2000)
            page.wait_for_timeout(1000)
        except Exception:
            pass

        search = page.locator('input[data-e2e="searchTermInput"]').first
        search.click()
        page.wait_for_timeout(300)
        search.fill(location)
        page.wait_for_timeout(1500)
        page.keyboard.press("Enter")
        page.wait_for_timeout(8000)

        body = page.locator("body").inner_text(timeout=10000)
        lines = [l.strip() for l in body.split("\\n") if l.strip()]

        start_idx = 0
        for i, l in enumerate(lines):
            if "Stores near" in l or "stores near" in l:
                start_idx = i + 1
                break

        i = start_idx
        while i < len(lines) and len(results) < max_results:
            m = HOURS_RE.match(lines[i])
            if m:
                distance = m.group(1) + " miles"
                hours = m.group(2).strip()
                name = lines[i - 2] if i >= 2 else "N/A"
                address = lines[i - 1] if i >= 1 else "N/A"

                features = []
                j = i + 1
                while j < len(lines):
                    cand = lines[j]
                    if cand in ("In store", "Order Here", "Pickup", "Delivery"):
                        features.append(cand)
                        j += 1
                    else:
                        break

                results.append({
                    "name": name,
                    "address": address,
                    "hours": hours,
                    "distance": distance,
                    "features": ", ".join(features) if features else "N/A",
                })
                i = j
                continue
            i += 1

        print(f'\\nFound {len(results)} stores near "{location}":\\n')
        for idx, s in enumerate(results, 1):
            print(f"  {idx}. {s['name']}")
            print(f"     Address: {s['address']}")
            print(f"     Hours: {s['hours']}")
            print(f"     Distance: {s['distance']}")
            print(f"     Features: {s['features']}")
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
        print(f"\\nTotal stores found: {len(items)}")
`;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Starbucks – Store Locator");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(\`  📍 Location: \${CFG.location}\`);
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

    console.log(\`🌐 Loading \${CFG.url}...\`);
    recorder.goto(CFG.url);
    await page.goto(CFG.url);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(CFG.waits.page);

    // Accept cookies
    try {
      const agree = page.locator('button:has-text("Agree")');
      if (await agree.first().isVisible({ timeout: 2000 })) {
        await agree.first().click();
        await page.waitForTimeout(1000);
      }
    } catch {}

    // Search for location
    await stagehand.act(\`Type "\${CFG.location}" in the store search field and press Enter\`);
    recorder.record("act", { instruction: \`Search for \${CFG.location}\` });
    await page.waitForTimeout(CFG.waits.search);
    console.log("✅ Searched\\n");

    const { z } = require("zod/v3");
    const listings = await stagehand.extract(
      \`Extract up to \${CFG.maxResults} Starbucks stores. For each, get the store name, address, hours, distance, and features.\`,
      z.object({
        stores: z.array(z.object({
          name: z.string().describe("Store name"),
          address: z.string().describe("Address"),
          hours: z.string().describe("Store hours"),
          distance: z.string().describe("Distance, e.g. '0.1 miles'"),
          features: z.string().describe("Available features: In store, Order Here, etc."),
        })).describe(\`Up to \${CFG.maxResults} stores\`),
      })
    );

    recorder.record("extract", {
      instruction: "Extract store listings",
      results: listings,
    });

    console.log(\`📋 Found \${listings.stores.length} stores:\`);
    listings.stores.forEach((s, i) => {
      console.log(\`   \${i + 1}. \${s.name}\`);
      console.log(\`      Address: \${s.address}  Hours: \${s.hours}  Distance: \${s.distance}\`);
      console.log(\`      Features: \${s.features}\`);
    });

    const pyScript = genPython(CFG, recorder);
    const pyPath = path.join(__dirname, "starbucks_store_locator.py");
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
