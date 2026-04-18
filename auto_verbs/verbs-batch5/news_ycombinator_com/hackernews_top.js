const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * news.ycombinator.com – Top Stories
 *
 * Navigates to Hacker News front page and extracts
 * top stories with title, URL, points, author, comments, and time.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  maxResults: 10,
  waits: { page: 3000 },
};

// ── Python Script Generator ──────────────────────────────────────────────────
function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
news.ycombinator.com – Top Stories
Extract top ${cfg.maxResults} stories from Hacker News

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
class HackerNewsRequest:
    max_results: int = ${cfg.maxResults}


@dataclass(frozen=True)
class HNStory:
    title: str = ""
    url: str = ""
    points: str = ""
    author: str = ""
    num_comments: str = ""
    time_posted: str = ""


@dataclass(frozen=True)
class HackerNewsResult:
    stories: list = None  # list[HNStory]


def hackernews_top(page: Page, request: HackerNewsRequest) -> HackerNewsResult:
    """Extract top stories from Hacker News."""
    print(f"  Max results: {request.max_results}\\n")

    # ── Navigate to front page ────────────────────────────────────────
    url = "https://news.ycombinator.com"
    print(f"Loading {url}...")
    checkpoint("Navigate to Hacker News")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(3000)

    # ── Extract stories ───────────────────────────────────────────────
    stories = page.evaluate(r"""(maxResults) => {
        const rows = document.querySelectorAll('tr.athing');
        const results = [];
        for (let i = 0; i < Math.min(rows.length, maxResults); i++) {
            const row = rows[i];
            const titleEl = row.querySelector('.titleline a');
            const domainEl = row.querySelector('.sitebit .sitestr');
            const subtextRow = row.nextElementSibling;
            const scoreEl = subtextRow ? subtextRow.querySelector('.score') : null;
            const userEl = subtextRow ? subtextRow.querySelector('.hnuser') : null;
            const ageEl = subtextRow ? subtextRow.querySelector('.age') : null;
            const commentLinks = subtextRow ? [...subtextRow.querySelectorAll('a')] : [];
            const commentEl = commentLinks.find(a => a.innerText.includes('comment'));

            const title = titleEl ? titleEl.innerText : '';
            const storyUrl = titleEl ? titleEl.href : '';
            const domain = domainEl ? ' (' + domainEl.innerText + ')' : '';
            const points = scoreEl ? scoreEl.innerText : '';
            const author = userEl ? userEl.innerText : '';
            const age = ageEl ? ageEl.innerText : '';
            const comments = commentEl ? commentEl.innerText : '0 comments';

            results.push({
                title,
                url: storyUrl + domain,
                points,
                author,
                num_comments: comments,
                time_posted: age,
            });
        }
        return results;
    }""", request.max_results)

    # ── Print results ─────────────────────────────────────────────────
    print("\\n" + "=" * 60)
    print("Hacker News - Top Stories")
    print("=" * 60)
    for idx, s in enumerate(stories, 1):
        print(f"\\n  {idx}. {s['title']}")
        print(f"     URL: {s['url']}")
        print(f"     {s['points']} | by {s['author']} | {s['time_posted']} | {s['num_comments']}")

    print(f"\\nFound {len(stories)} stories")
    return HackerNewsResult(
        stories=[HNStory(**s) for s in stories]
    )


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("news_ycombinator_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = hackernews_top(page, HackerNewsRequest())
            print(f"\\nReturned {len(result.stories or [])} stories")
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
    const url = "https://news.ycombinator.com";
    console.log(`\n🌐 Navigating to ${url}...`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url, description: "Navigate to Hacker News front page" });

    const stories = await page.evaluate((maxResults) => {
      const rows = document.querySelectorAll("tr.athing");
      const results = [];
      for (let i = 0; i < Math.min(rows.length, maxResults); i++) {
        const row = rows[i];
        const titleEl = row.querySelector(".titleline a");
        const domainEl = row.querySelector(".sitebit .sitestr");
        const subtextRow = row.nextElementSibling;
        const scoreEl = subtextRow ? subtextRow.querySelector(".score") : null;
        const userEl = subtextRow ? subtextRow.querySelector(".hnuser") : null;
        const ageEl = subtextRow ? subtextRow.querySelector(".age") : null;
        const commentLinks = subtextRow ? [...subtextRow.querySelectorAll("a")] : [];
        const commentEl = commentLinks.find(a => a.innerText.includes("comment"));

        const title = titleEl ? titleEl.innerText : "";
        const storyUrl = titleEl ? titleEl.href : "";
        const domain = domainEl ? " (" + domainEl.innerText + ")" : "";
        const points = scoreEl ? scoreEl.innerText : "";
        const author = userEl ? userEl.innerText : "";
        const age = ageEl ? ageEl.innerText : "";
        const comments = commentEl ? commentEl.innerText : "0 comments";

        results.push({
          title,
          url: storyUrl + domain,
          points,
          author,
          num_comments: comments,
          time_posted: age,
        });
      }
      return results;
    }, CFG.maxResults);

    recorder.record("extract", {
      instruction: "Extract top stories",
      description: `Extracted ${stories.length} stories`,
      results: stories,
    });

    console.log(`\n📋 Found ${stories.length} stories:\n`);
    stories.forEach((s, i) => {
      console.log(`   ${i + 1}. ${s.title}`);
      console.log(`      URL: ${s.url}`);
      console.log(`      ${s.points} | by ${s.author} | ${s.time_posted} | ${s.num_comments}`);
    });

    const dir = path.join(__dirname);
    fs.writeFileSync(
      path.join(dir, "recorded_actions.json"),
      JSON.stringify(recorder.actions, null, 2)
    );
    console.log(`\n💾 Saved ${recorder.actions.length} actions`);

    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(dir, "hackernews_top.py"), pyCode);
    console.log("🐍 Saved Python script");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
