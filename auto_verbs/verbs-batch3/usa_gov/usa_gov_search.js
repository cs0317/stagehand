const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * USA.gov – Government Information Search
 */

const CFG = {
  url: "https://search.usa.gov/search",
  affiliate: "usagov_en_internal",
  query: "passport renewal",
  maxResults: 5,
  waits: { page: 2000, search: 3000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
USA.gov – Government Information Search
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
    profile_dir = get_temp_profile_dir("usa_gov")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        # ── Navigate directly to search results ──────────────────────────
        query_encoded = query.replace(" ", "+")
        search_url = f"${cfg.url}?affiliate=${cfg.affiliate}&query={query_encoded}"
        print(f"Loading {search_url}...")
        page.goto(search_url, timeout=30000)
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(2000)

        # ── Wait for results ─────────────────────────────────────────────
        print("Waiting for results...")
        try:
            page.locator(".result").first.wait_for(state="visible", timeout=10000)
        except Exception:
            pass
        page.wait_for_timeout(1000)
        print(f"  Loaded: {page.url}")

        # ── Extract results ──────────────────────────────────────────────
        print(f"Extracting up to {max_results} results...")

        cards = page.locator(".result")
        count = cards.count()
        print(f"  Found {count} result cards on page")

        for i in range(min(count, max_results)):
            card = cards.nth(i)
            try:
                text = card.inner_text(timeout=3000)
                lines = [ln.strip() for ln in text.split("\\n") if ln.strip()]

                # Line 0: title
                title = lines[0] if len(lines) > 0 else "N/A"

                # Line 1: description
                description = lines[1] if len(lines) > 1 else "N/A"

                # Line 2: URL
                url = lines[2] if len(lines) > 2 else "N/A"
                if url != "N/A" and not url.startswith("http"):
                    url = "https://" + url

                if title == "N/A":
                    continue

                results.append({
                    "title": title,
                    "description": description,
                    "url": url,
                })
            except Exception:
                continue

        # ── Print results ─────────────────────────────────────────────────
        print(f'\\nFound {len(results)} results for "{query}":\\n')
        for i, r in enumerate(results, 1):
            print(f"  {i}. {r['title']}")
            print(f"     {r['description'][:100]}")
            print(f"     {r['url']}")
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
        print(f"\\nTotal results found: {len(items)}")
`;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  USA.gov – Government Information Search");
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
    const searchUrl = \`\${CFG.url}?affiliate=\${CFG.affiliate}&query=\${queryEncoded}\`;
    console.log(\`🌐 Loading \${searchUrl}...\`);
    recorder.goto(searchUrl);
    await page.goto(searchUrl);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(CFG.waits.search);
    console.log("✅ Loaded\\n");

    const { z } = require("zod/v3");
    const listings = await stagehand.extract(
      \`Extract up to \${CFG.maxResults} search results. For each, get the page title, description snippet, and URL.\`,
      z.object({
        results: z.array(z.object({
          title: z.string().describe("Page title"),
          description: z.string().describe("Description snippet"),
          url: z.string().describe("Page URL"),
        })).describe(\`Up to \${CFG.maxResults} results\`),
      })
    );

    recorder.record("extract", {
      instruction: "Extract search results",
      description: \`Extract up to \${CFG.maxResults} results\`,
      results: listings,
    });

    console.log(\`📋 Found \${listings.results.length} results:\`);
    listings.results.forEach((r, i) => {
      console.log(\`   \${i + 1}. \${r.title}\`);
      console.log(\`      \${r.description.substring(0, 80)}\`);
      console.log(\`      \${r.url}\`);
    });

    const pyScript = genPython(CFG, recorder);
    const pyPath = path.join(__dirname, "usa_gov_search.py");
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
      fs.writeFileSync(path.join(__dirname, "usa_gov_search.py"), pyScript, "utf-8");
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
