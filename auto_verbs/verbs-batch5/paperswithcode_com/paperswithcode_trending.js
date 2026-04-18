const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * paperswithcode.com (now Hugging Face Papers) – Trending Papers
 *
 * PapersWithCode now redirects to huggingface.co/papers/trending.
 * Extracts trending papers with title, authors, date, upvotes, and GitHub stars.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  maxResults: 5,
  waits: { page: 5000 },
};

// ── Python Script Generator ──────────────────────────────────────────────────
function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
paperswithcode.com – Trending Papers
(PapersWithCode now redirects to Hugging Face Papers)
Extract top ${cfg.maxResults} trending papers

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
class TrendingPapersRequest:
    max_results: int = ${cfg.maxResults}


@dataclass(frozen=True)
class TrendingPaper:
    title: str = ""
    authors: str = ""
    publication_date: str = ""
    upvotes: str = ""
    github_stars: str = ""


@dataclass(frozen=True)
class TrendingPapersResult:
    papers: list = None  # list[TrendingPaper]


def trending_papers(page: Page, request: TrendingPapersRequest) -> TrendingPapersResult:
    """Extract trending papers from Papers With Code / Hugging Face."""
    print(f"  Max results: {request.max_results}\\n")

    # ── Navigate ──────────────────────────────────────────────────────
    url = "https://paperswithcode.com"
    print(f"Loading {url} (redirects to HF papers)...")
    checkpoint("Navigate to PapersWithCode / HF Papers")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    # ── Extract papers ────────────────────────────────────────────────
    papers = page.evaluate(r"""(maxResults) => {
        const articles = document.querySelectorAll('article');
        const results = [];
        for (let i = 0; i < Math.min(articles.length, maxResults); i++) {
            const article = articles[i];
            const text = article.innerText;
            const lines = text.split('\\n').map(l => l.trim()).filter(l => l.length > 0);

            // Title: first long line (skip "Submitted by" header)
            let title = '';
            let titleIdx = 0;
            for (let j = 0; j < lines.length; j++) {
                if (lines[j].length > 30 && !lines[j].startsWith('Submitted') && !lines[j].startsWith('Upvote') && !lines[j].startsWith('GitHub') && !lines[j].startsWith('arXiv')) {
                    title = lines[j];
                    titleIdx = j;
                    break;
                }
            }

            // Authors: look for "N authors" or org name near title
            let authors = '';
            for (let j = titleIdx + 1; j < lines.length; j++) {
                if (lines[j].match(/author/i) || lines[j] === '·') {
                    // Get the actual author text (might be on next/previous line)
                    if (lines[j].match(/\\d+\\s+author/i)) {
                        authors = lines[j];
                    } else if (j + 1 < lines.length && lines[j + 1].match(/\\d+\\s+author/i)) {
                        authors = lines[j + 1];
                    }
                    break;
                }
                // Org name (no "author" keyword, but short line after summary)
                if (lines[j].length < 60 && !lines[j].match(/^(Published|Upvote|GitHub|arXiv|Submitted)/)) {
                    authors = lines[j];
                    break;
                }
            }

            // Publication date
            let pubDate = '';
            const dateMatch = text.match(/Published on\\s+([A-Za-z]+\\s+\\d+,\\s+\\d{4})/);
            if (dateMatch) pubDate = dateMatch[1];

            // Upvotes
            let upvotes = '';
            const upvoteMatch = text.match(/Upvote\\s*(\\d+)/);
            if (upvoteMatch) upvotes = upvoteMatch[1];

            // GitHub stars
            let githubStars = '';
            const ghMatch = text.match(/GitHub\\s*([\\d.]+k?)/i);
            if (ghMatch) githubStars = ghMatch[1];

            results.push({ title, authors, publication_date: pubDate, upvotes, github_stars: githubStars });
        }
        return results;
    }""", request.max_results)

    # ── Print results ─────────────────────────────────────────────────
    print("\\n" + "=" * 60)
    print("Trending Papers (PapersWithCode / Hugging Face)")
    print("=" * 60)
    for idx, p in enumerate(papers, 1):
        print(f"\\n  {idx}. {p['title']}")
        print(f"     Authors: {p['authors']} | Published: {p['publication_date']}")
        print(f"     Upvotes: {p['upvotes']} | GitHub: {p['github_stars']}")

    print(f"\\nFound {len(papers)} papers")
    return TrendingPapersResult(
        papers=[TrendingPaper(**p) for p in papers]
    )


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("paperswithcode_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = trending_papers(page, TrendingPapersRequest())
            print(f"\\nReturned {len(result.papers or [])} papers")
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
    const url = "https://paperswithcode.com";
    console.log(`\n🌐 Navigating to ${url}...`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url, description: "Navigate to PapersWithCode (→ HF Papers)" });

    const papers = await page.evaluate((maxResults) => {
      const articles = document.querySelectorAll("article");
      const results = [];
      for (let i = 0; i < Math.min(articles.length, maxResults); i++) {
        const article = articles[i];
        const text = article.innerText;
        const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);

        let title = "";
        let titleIdx = 0;
        for (let j = 0; j < lines.length; j++) {
          if (lines[j].length > 30 && !lines[j].startsWith("Submitted") && !lines[j].startsWith("Upvote") && !lines[j].startsWith("GitHub") && !lines[j].startsWith("arXiv")) {
            title = lines[j];
            titleIdx = j;
            break;
          }
        }

        let authors = "";
        for (let j = titleIdx + 1; j < lines.length; j++) {
          if (lines[j].match(/author/i) || lines[j] === "·") {
            if (lines[j].match(/\d+\s+author/i)) {
              authors = lines[j];
            } else if (j + 1 < lines.length && lines[j + 1].match(/\d+\s+author/i)) {
              authors = lines[j + 1];
            }
            break;
          }
          if (lines[j].length < 60 && !lines[j].match(/^(Published|Upvote|GitHub|arXiv|Submitted)/)) {
            authors = lines[j];
            break;
          }
        }

        let pubDate = "";
        const dateMatch = text.match(/Published on\s+([A-Za-z]+\s+\d+,\s+\d{4})/);
        if (dateMatch) pubDate = dateMatch[1];

        let upvotes = "";
        const upvoteMatch = text.match(/Upvote\s*(\d+)/);
        if (upvoteMatch) upvotes = upvoteMatch[1];

        let githubStars = "";
        const ghMatch = text.match(/GitHub\s*([\d.]+k?)/i);
        if (ghMatch) githubStars = ghMatch[1];

        results.push({ title, authors, publication_date: pubDate, upvotes, github_stars: githubStars });
      }
      return results;
    }, CFG.maxResults);

    recorder.record("extract", {
      instruction: "Extract trending papers",
      description: `Extracted ${papers.length} papers`,
      results: papers,
    });

    console.log("\n" + "=".repeat(60));
    console.log("Trending Papers (PapersWithCode / Hugging Face)");
    console.log("=".repeat(60));
    papers.forEach((p, i) => {
      console.log(`\n   ${i + 1}. ${p.title}`);
      console.log(`      Authors: ${p.authors} | Published: ${p.publication_date}`);
      console.log(`      Upvotes: ${p.upvotes} | GitHub: ${p.github_stars}`);
    });

    const dir = path.join(__dirname);
    fs.writeFileSync(
      path.join(dir, "recorded_actions.json"),
      JSON.stringify(recorder.actions, null, 2)
    );
    console.log(`\n💾 Saved ${recorder.actions.length} actions`);

    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(dir, "paperswithcode_trending.py"), pyCode);
    console.log("🐍 Saved Python script");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
