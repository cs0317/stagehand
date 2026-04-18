const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * imdb.com – Academy Awards (Oscars)
 *
 * Navigates to the most recent Oscars event page and extracts
 * award categories with winners.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  url: "https://www.imdb.com/event/ev0000003/",
  maxResults: 5,
  waits: { page: 5000 },
};

// ── Python Script Generator ──────────────────────────────────────────────────
function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
imdb.com – Academy Awards (Oscars)

Generated on: ${ts}
Recorded ${n} browser interactions

Uses Playwright's native locator API with the user's Chrome profile.
"""

import re
import os, sys, shutil
from dataclasses import dataclass
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class OscarRequest:
    max_results: int = ${cfg.maxResults}


@dataclass(frozen=True)
class OscarCategory:
    category_name: str = ""
    winner_name: str = ""
    film_title: str = ""


@dataclass(frozen=True)
class OscarResult:
    categories: list = None  # list[OscarCategory]


def oscar_winners(page: Page, request: OscarRequest) -> OscarResult:
    """Extract Oscar winners from the most recent ceremony."""
    max_results = request.max_results
    print(f"  Max categories: {max_results}\\n")

    # ── Navigate to Oscars event page ─────────────────────────────────
    url = "${cfg.url}"
    print(f"Loading {url}...")
    checkpoint("Navigate to IMDb Oscars page")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    # ── Extract categories and winners ────────────────────────────────
    categories = page.evaluate(r"""(maxResults) => {
        const sections = document.querySelectorAll('section.ipc-page-section');
        const results = [];
        for (const sec of sections) {
            if (results.length >= maxResults) break;
            const h3 = sec.querySelector('h3');
            if (!h3) continue;
            const catName = h3.innerText.trim();
            if (!catName.startsWith('Best ')) continue;

            const text = sec.innerText;
            const winnerIdx = text.indexOf('WINNER');
            if (winnerIdx < 0) continue;

            const afterWinner = text.substring(winnerIdx + 6).trim();
            const lines = afterWinner.split('\\n').map(l => l.trim()).filter(l => l.length > 0);
            if (lines.length < 2) continue;

            let winnerName = '';
            let filmTitle = '';
            const isRating = /^\\d+\\.?\\d*$/.test(lines[1]);
            if (isRating) {
                filmTitle = lines[0];
                for (let i = 2; i < lines.length; i++) {
                    if (lines[i] === 'Rate' || /^\\(/.test(lines[i])) continue;
                    if (/^\\d+\\.?\\d*$/.test(lines[i])) continue;
                    winnerName = lines[i].replace(/\\(.*\\)/, '').trim();
                    break;
                }
            } else {
                winnerName = lines[0];
                filmTitle = lines[1];
            }

            results.push({ category_name: catName, winner_name: winnerName, film_title: filmTitle });
        }
        return results;
    }""", max_results)

    # ── Print results ─────────────────────────────────────────────────
    print("\\n" + "=" * 60)
    print("Academy Awards (Oscars) – Winners")
    print("=" * 60)
    for idx, c in enumerate(categories, 1):
        print(f"\\n{idx}. {c['category_name']}")
        print(f"   Winner: {c['winner_name']}")
        print(f"   Film: {c['film_title']}")

    print(f"\\nExtracted {len(categories)} categories")

    return OscarResult(
        categories=[OscarCategory(**c) for c in categories]
    )


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("imdb_com__awards")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = oscar_winners(page, OscarRequest())
            print(f"\\nReturned {len(result.categories or [])} categories")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
`;
}

// ── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  const llmClient = setupLLMClient();
  const stagehand = new Stagehand({
    env: "LOCAL",
    verbose: 1,
    llmClient,
    localBrowserLaunchOptions: {
      headless: false,
      args: ["--disable-blink-features=AutomationControlled", "--start-maximized"],
    },
  });
  await stagehand.init();
  const page = stagehand.context.pages()[0];
  const recorder = new PlaywrightRecorder();

  try {
    console.log(`\n🌐 Navigating to ${CFG.url}...`);
    await page.goto(CFG.url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url: CFG.url, description: "Navigate to IMDb Oscars page" });

    const categories = await page.evaluate((maxResults) => {
      const sections = document.querySelectorAll("section.ipc-page-section");
      const results = [];
      for (const sec of sections) {
        if (results.length >= maxResults) break;
        const h3 = sec.querySelector("h3");
        if (!h3) continue;
        const catName = h3.innerText.trim();
        if (!catName.startsWith("Best ")) continue;

        const text = sec.innerText;
        const winnerIdx = text.indexOf("WINNER");
        if (winnerIdx < 0) continue;

        const afterWinner = text.substring(winnerIdx + 6).trim();
        const lines = afterWinner.split("\n").map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length < 2) continue;

        let winnerName = "";
        let filmTitle = "";
        // If 2nd line is a rating like "7.7", it's a film-first category (Picture/Screenplay)
        const isRating = /^\d+\.?\d*$/.test(lines[1]);
        if (isRating) {
          filmTitle = lines[0];
          // Find first person name (skip rating, votes, "Rate")
          for (let i = 2; i < lines.length; i++) {
            if (lines[i] === "Rate" || /^\(/.test(lines[i])) continue;
            if (/^\d+\.?\d*$/.test(lines[i])) continue;
            winnerName = lines[i].replace(/\(.*\)/, "").trim();
            break;
          }
        } else {
          winnerName = lines[0];
          filmTitle = lines[1];
        }

        results.push({ category_name: catName, winner_name: winnerName, film_title: filmTitle });
      }
      return results;
    }, CFG.maxResults);

    recorder.record("extract", {
      instruction: "Extract Oscar categories and winners",
      description: `Extracted ${categories.length} categories`,
      results: categories,
    });

    console.log(`\n📋 Found ${categories.length} Oscar categories:\n`);
    categories.forEach((c, i) => {
      console.log(`   ${i + 1}. ${c.category_name}`);
      console.log(`      Winner: ${c.winner_name}`);
      console.log(`      Film: ${c.film_title}`);
    });

    const dir = path.join(__dirname);
    fs.writeFileSync(path.join(dir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    console.log(`\n💾 Saved ${recorder.actions.length} actions`);

    fs.writeFileSync(path.join(dir, "imdb_oscars.py"), genPython(CFG, recorder));
    console.log(`🐍 Saved Python script`);

  } catch (err) {
    console.error("❌ Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
