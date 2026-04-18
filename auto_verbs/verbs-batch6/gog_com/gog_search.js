const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  query: "roguelike",
  maxResults: 5,
  waits: { page: 5000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
GOG – Game Search
Query: "${cfg.query}"

Generated on: ${ts}
Recorded ${n} browser interactions
"""

import re
import os, sys, shutil
from dataclasses import dataclass, field
from urllib.parse import quote_plus
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class GameRequest:
    query: str = "${cfg.query}"
    max_results: int = ${cfg.maxResults}


@dataclass
class Game:
    title: str = ""
    price: str = ""
    discount: str = ""
    rating: str = ""
    url: str = ""


@dataclass
class GameResult:
    games: list = field(default_factory=list)


def gog_search(page: Page, request: GameRequest) -> GameResult:
    """Search GOG for games."""
    print(f"  Query: {request.query}\\n")

    url = f"https://www.gog.com/en/games?query={quote_plus(request.query)}"
    print(f"Loading {url}...")
    checkpoint("Navigate to GOG search")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    checkpoint("Extract game listings")
    items_data = page.evaluate(r"""(maxResults) => {
        const results = [];
        const items = document.querySelectorAll(
            '[class*="product-tile"], [class*="game-card"], a[href*="/game/"], a[href*="/en/game/"]'
        );
        const seen = new Set();
        for (const item of items) {
            if (results.length >= maxResults) break;
            const titleEl = item.querySelector('[class*="title"], h3, h4, [class*="name"]');
            const title = titleEl ? titleEl.innerText.trim() : item.innerText.trim().split('\\n')[0];
            if (!title || title.length < 2 || seen.has(title)) continue;
            seen.add(title);

            const text = item.innerText || '';
            let price = '', discount = '', rating = '', gUrl = '';

            if (item.href) gUrl = item.href;

            const priceEl = item.querySelector('[class*="price"], [class*="final"]');
            if (priceEl) price = priceEl.innerText.trim();

            const discEl = item.querySelector('[class*="discount"], [class*="save"]');
            if (discEl) discount = discEl.innerText.trim();

            const ratEl = item.querySelector('[class*="rating"], [class*="score"]');
            if (ratEl) rating = ratEl.innerText.trim();

            results.push({ title, price, discount, rating, url: gUrl });
        }
        return results;
    }""", request.max_results)

    result = GameResult(games=[Game(**g) for g in items_data])

    print("\\n" + "=" * 60)
    print(f"GOG: {request.query}")
    print("=" * 60)
    for g in result.games:
        disc = f" ({g.discount})" if g.discount else ""
        print(f"  {g.title}")
        print(f"    Price: {g.price}{disc}  Rating: {g.rating}")
        print(f"    URL: {g.url}")
    print(f"\\n  Total: {len(result.games)} games")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("gog_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = gog_search(page, GameRequest())
            print(f"\\nReturned {len(result.games)} games")
        finally:
            browser.close()
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
`;
}

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
    const url = `https://www.gog.com/en/games?query=${encodeURIComponent(CFG.query)}`;
    console.log(`\n🌐 Searching: ${url}...`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url, description: "Search GOG" });

    const games = await stagehand.extract(
      "extract up to 5 game results with title, price, discount percentage, rating, and game URL"
    );
    console.log("\n📊 Games:", JSON.stringify(games, null, 2));
    recorder.record("extract", { instruction: "Extract games", results: games });

    const dir = path.join(__dirname);
    fs.writeFileSync(path.join(dir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    console.log(`\n💾 Saved ${recorder.actions.length} actions`);

    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(dir, "gog_search.py"), pyCode);
    console.log("🐍 Saved Python script");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
