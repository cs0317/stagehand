const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  query: "sourdough bread",
  maxResults: 5,
  waits: { page: 5000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Food52 – Recipe Search
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
class RecipeRequest:
    query: str = "${cfg.query}"
    max_results: int = ${cfg.maxResults}


@dataclass
class Recipe:
    name: str = ""
    author: str = ""
    rating: str = ""
    description: str = ""


@dataclass
class RecipeResult:
    recipes: list = field(default_factory=list)


def food52_search(page: Page, request: RecipeRequest) -> RecipeResult:
    """Search Food52 for recipes."""
    print(f"  Query: {request.query}\\n")

    url = f"https://food52.com/recipes/search?q={quote_plus(request.query)}"
    print(f"Loading {url}...")
    checkpoint("Navigate to Food52 search")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    checkpoint("Extract recipe listings")
    items_data = page.evaluate(r"""(maxResults) => {
        const results = [];
        const items = document.querySelectorAll(
            'article, [class*="card"], [class*="recipe"], a[href*="/recipes/"]'
        );
        const seen = new Set();
        for (const item of items) {
            if (results.length >= maxResults) break;
            const titleEl = item.querySelector('h2, h3, h4, [class*="title"], [class*="name"]');
            const name = titleEl ? titleEl.innerText.trim() : '';
            if (!name || name.length < 3 || seen.has(name)) continue;
            seen.add(name);

            const text = item.innerText || '';
            let author = '', rating = '', description = '';

            const authorEl = item.querySelector('[class*="author"], [class*="byline"], [class*="creator"]');
            if (authorEl) author = authorEl.innerText.trim().replace(/^by\\s*/i, '');

            const ratM = text.match(/(\\d+\\.?\\d*)\\s*(?:\\/\\s*5|stars?|rating)/i);
            if (ratM) rating = ratM[1];

            const descEl = item.querySelector('p, [class*="desc"], [class*="dek"]');
            if (descEl) description = descEl.innerText.trim().slice(0, 200);

            results.push({ name, author, rating, description });
        }
        return results;
    }""", request.max_results)

    result = RecipeResult(recipes=[Recipe(**r) for r in items_data])

    print("\\n" + "=" * 60)
    print(f"Food52: {request.query}")
    print("=" * 60)
    for r in result.recipes:
        print(f"  {r.name}")
        print(f"    Author: {r.author}  Rating: {r.rating}")
        print(f"    Desc: {r.description[:80]}...")
    print(f"\\n  Total: {len(result.recipes)} recipes")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("food52_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = food52_search(page, RecipeRequest())
            print(f"\\nReturned {len(result.recipes)} recipes")
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
    const url = `https://food52.com/recipes/search?q=${encodeURIComponent(CFG.query)}`;
    console.log(`\n🌐 Searching: ${url}...`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url, description: "Search Food52" });

    const recipes = await stagehand.extract(
      "extract up to 5 recipe results with recipe name, author, rating, and description"
    );
    console.log("\n📊 Recipes:", JSON.stringify(recipes, null, 2));
    recorder.record("extract", { instruction: "Extract recipes", results: recipes });

    const dir = path.join(__dirname);
    fs.writeFileSync(path.join(dir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    console.log(`\n💾 Saved ${recorder.actions.length} actions`);

    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(dir, "food52_search.py"), pyCode);
    console.log("🐍 Saved Python script");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
