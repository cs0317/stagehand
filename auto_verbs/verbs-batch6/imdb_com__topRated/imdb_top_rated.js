const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  maxResults: 10,
  waits: { page: 5000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
IMDb – Top Rated Movies (Top 250)

Generated on: ${ts}
Recorded ${n} browser interactions
"""

import re
import os, sys, shutil
from dataclasses import dataclass, field
from typing import List
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class MovieRequest:
    max_results: int = ${cfg.maxResults}


@dataclass
class Movie:
    rank: str = ""
    title: str = ""
    year: str = ""
    rating: str = ""
    votes: str = ""


@dataclass
class MovieResult:
    movies: List[Movie] = field(default_factory=list)


def imdb_top_rated(page: Page, request: MovieRequest) -> MovieResult:
    """Extract top rated movies from IMDb Top 250."""
    url = "https://www.imdb.com/chart/top/"
    print(f"Loading {url}...")
    checkpoint("Navigate to IMDb Top 250")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    checkpoint("Extract top movies")
    movies = []

    rows = page.locator("li.ipc-metadata-list-summary-item, ul[class*='compact-list'] li").all()
    for i, row in enumerate(rows[:request.max_results]):
        try:
            text = row.inner_text().strip()
            lines = [l.strip() for l in text.split("\\n") if l.strip()]
            title = ""
            year = ""
            rating = ""
            votes = ""

            for line in lines:
                tm = re.search(r"^\\d+\\.\\s*(.+)", line)
                if tm:
                    title = tm.group(1).strip()
                ym = re.search(r"\\b((?:19|20)\\d{2})\\b", line)
                if ym and not year:
                    year = ym.group(1)
                rm = re.search(r"(\\d+\\.\\d+)", line)
                if rm and not rating and float(rm.group(1)) <= 10:
                    rating = rm.group(1)
                vm = re.search(r"\\((\\d[\\d,.]*[KMB]?)\\)", line)
                if vm:
                    votes = vm.group(1)

            if not title and lines:
                title = lines[0]

            movies.append(Movie(
                rank=str(i + 1), title=title[:100],
                year=year, rating=rating, votes=votes,
            ))
        except Exception:
            pass

    if not movies:
        body_text = page.evaluate("document.body.innerText") or ""
        lines = [l.strip() for l in body_text.split("\\n") if l.strip()]
        for line in lines:
            m = re.search(r"^(\\d+)\\.\\s+(.+)", line)
            if m:
                rank = m.group(1)
                rest = m.group(2)
                movies.append(Movie(rank=rank, title=rest[:100]))
                if len(movies) >= request.max_results:
                    break

    result = MovieResult(movies=movies[:request.max_results])

    print("\\n" + "=" * 70)
    print("IMDb Top Rated Movies")
    print("=" * 70)
    for m in result.movies:
        print(f"  {m.rank:>3}. {m.title} ({m.year})  Rating: {m.rating}  Votes: {m.votes}")
    print(f"\\nTotal: {len(result.movies)} movies")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("imdb_com__topRated")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = imdb_top_rated(page, MovieRequest())
            print(f"\\nReturned {len(result.movies)} movies")
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
    console.log("\n🌐 Loading IMDb Top 250...");
    await page.goto("https://www.imdb.com/chart/top/", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url: "https://www.imdb.com/chart/top/", description: "Navigate to IMDb Top 250" });

    const movies = await stagehand.extract(
      `extract the top ${CFG.maxResults} movies with rank, title, year, rating, and number of votes`
    );
    console.log("\n📊 Movies:", JSON.stringify(movies, null, 2));
    recorder.record("extract", { instruction: "Extract top movies", results: movies });

    const dir = path.join(__dirname);
    fs.writeFileSync(path.join(dir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    console.log(`\n💾 Saved ${recorder.actions.length} actions`);

    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(dir, "imdb_top_rated.py"), pyCode);
    console.log("🐍 Saved Python script");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
