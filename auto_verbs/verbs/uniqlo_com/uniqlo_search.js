const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * Uniqlo – Product Search
 */

const CFG = {
  url: "https://www.uniqlo.com/us/en/search",
  query: "ultra light down jacket",
  maxResults: 5,
  waits: { page: 2000, search: 4000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Uniqlo – Product Search
Query: ${cfg.query}
Max results: ${cfg.maxResults}

Generated on: ${ts}
Recorded ${n} browser interactions

Uses Playwright with CDP connection to a real Chrome instance.
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
    profile_dir = get_temp_profile_dir("uniqlo_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        query_encoded = query.replace(" ", "+")
        search_url = f"${cfg.url}?q={query_encoded}"
        print(f"Loading {search_url}...")
        page.goto(search_url, timeout=30000)
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(2000)

        for selector in ['button[aria-label="Close"]', "button#onetrust-accept-btn-handler"]:
            try:
                btn = page.locator(selector).first
                if btn.is_visible(timeout=2000):
                    btn.click()
                    page.wait_for_timeout(500)
                    break
            except Exception:
                pass

        print("Waiting for product listings...")
        try:
            page.locator('a[class*="product"]').first.wait_for(state="visible", timeout=10000)
        except Exception:
            pass
        page.wait_for_timeout(2000)
        print(f"  Loaded: {page.url}")

        print(f"Extracting up to {max_results} products...")
        cards = page.locator('a[class*="product"]')
        count = cards.count()
        print(f"  Found {count} product cards on page")

        seen_names = set()
        for i in range(min(count, max_results * 3)):
            if len(results) >= max_results:
                break
            card = cards.nth(i)
            try:
                text = card.inner_text(timeout=3000)
                lines = [ln.strip() for ln in text.split("\\n") if ln.strip()]
                name = lines[1] if len(lines) > 1 else "N/A"
                name_key = name.lower()
                if name_key in seen_names:
                    continue
                seen_names.add(name_key)

                price = "N/A"
                for ln in lines:
                    m = re.search(r"\\$[\\d,.]+", ln)
                    if m:
                        price = m.group(0)
                        break

                color_codes = card.evaluate("""e => {
                    const imgs = e.querySelectorAll('img');
                    return Array.from(imgs).map(i => i.alt).filter(a => /^\\\\d{2}$/.test(a));
                }""")
                num_colors = len(color_codes)
                colors_str = f"{num_colors} color{'s' if num_colors != 1 else ''}"

                if name == "N/A":
                    continue
                results.append({"name": name, "price": price, "colors": colors_str})
            except Exception:
                continue

        print(f'\\nFound {len(results)} products for "{query}":\\n')
        for i, p in enumerate(results, 1):
            print(f"  {i}. {p['name']}")
            print(f"     Price: {p['price']}  Colors: {p['colors']}")
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

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Uniqlo – Product Search");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(\`  🔍 Query: \${CFG.query}\`);
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

    const queryEncoded = CFG.query.replace(/ /g, "+");
    const searchUrl = \`\${CFG.url}?q=\${queryEncoded}\`;
    console.log(\`🌐 Loading \${searchUrl}...\`);
    recorder.goto(searchUrl);
    await page.goto(searchUrl);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(CFG.waits.search);
    console.log("✅ Loaded\\n");

    const { z } = require("zod/v3");
    const listings = await stagehand.extract(
      \`Extract up to \${CFG.maxResults} products. For each, get the product name, price, and number of available colors.\`,
      z.object({
        products: z.array(z.object({
          name: z.string().describe("Product name"),
          price: z.string().describe("Price, e.g. '$29.90'"),
          colors: z.string().describe("Number of available colors"),
        })).describe(\`Up to \${CFG.maxResults} products\`),
      })
    );

    recorder.record("extract", {
      instruction: "Extract products",
      description: \`Extract up to \${CFG.maxResults} products\`,
      results: listings,
    });

    console.log(\`📋 Found \${listings.products.length} products:\`);
    listings.products.forEach((p, i) => {
      console.log(\`   \${i + 1}. \${p.name}\`);
      console.log(\`      Price: \${p.price}  Colors: \${p.colors}\`);
    });

    const pyScript = genPython(CFG, recorder);
    fs.writeFileSync(path.join(__dirname, "uniqlo_search.py"), pyScript, "utf-8");
    fs.writeFileSync(path.join(__dirname, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2), "utf-8");

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
