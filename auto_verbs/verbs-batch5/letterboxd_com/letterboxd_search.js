const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

/**
 * letterboxd.com – Film Info & Reviews
 *
 * Navigates to a film page on Letterboxd and extracts
 * film info (title, year, director, rating) and popular reviews.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  filmSlug: "parasite-2019",
  filmTitle: "Parasite",
  maxReviews: 5,
  waits: { page: 5000 },
};

// ── Python Script Generator ──────────────────────────────────────────────────
function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
letterboxd.com – Film Info & Reviews
Film: ${cfg.filmTitle}

Generated on: ${ts}
Recorded ${n} browser interactions

Uses Playwright's native locator API with the user's Chrome profile.
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
class LetterboxdRequest:
    film_title: str = "${cfg.filmTitle}"
    film_slug: str = "${cfg.filmSlug}"
    max_reviews: int = ${cfg.maxReviews}


@dataclass(frozen=True)
class Review:
    reviewer_name: str = ""
    rating: str = ""
    review_snippet: str = ""


@dataclass(frozen=True)
class LetterboxdResult:
    film_title: str = ""
    year: str = ""
    director: str = ""
    average_rating: str = ""
    reviews: list = None  # list[Review]


def letterboxd_search(page: Page, request: LetterboxdRequest) -> LetterboxdResult:
    """Search Letterboxd for film info and popular reviews."""
    slug = request.film_slug
    print(f"  Film: {request.film_title}\\n")

    # ── Navigate to film page ─────────────────────────────────────────
    url = f"https://letterboxd.com/film/{slug}/"
    print(f"Loading {url}...")
    checkpoint("Navigate to Letterboxd film page")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    # ── Extract film info from meta tags ──────────────────────────────
    film_info = page.evaluate(r"""() => {
        const getMeta = (name) => {
            const el = document.querySelector('meta[name="' + name + '"]')
                     || document.querySelector('meta[property="' + name + '"]');
            return el ? el.content : '';
        };
        const ogTitle = getMeta('og:title');
        const match = ogTitle.match(/^(.+?)\\s*\\((\\d{4})\\)$/);
        const title = match ? match[1] : ogTitle;
        const year = match ? match[2] : '';
        const director = getMeta('twitter:data1');
        const ratingStr = getMeta('twitter:data2');
        const ratingMatch = ratingStr.match(/([\\d.]+)\\s+out of/);
        const avgRating = ratingMatch ? ratingMatch[1] : ratingStr;
        return { title, year, director, avgRating };
    }""")

    # ── Extract popular reviews ───────────────────────────────────────
    reviews = page.evaluate(r"""(maxReviews) => {
        const articles = document.querySelectorAll('article.production-viewing');
        const results = [];
        for (let i = 0; i < Math.min(articles.length, maxReviews); i++) {
            const a = articles[i];
            const nameEl = a.querySelector('span.owner');
            const name = nameEl ? nameEl.innerText.trim() : '';
            const ratingSvg = a.querySelector('span.inline-rating svg');
            let rating = '';
            if (ratingSvg) {
                const label = ratingSvg.getAttribute('aria-label') || '';
                rating = label;
            }
            const bodyEl = a.querySelector('.js-review-body p');
            const snippet = bodyEl ? bodyEl.innerText.substring(0, 200).trim() : '';
            results.push({ reviewer_name: name, rating, review_snippet: snippet });
        }
        return results;
    }""", request.max_reviews)

    # ── Print results ─────────────────────────────────────────────────
    print("\\n" + "=" * 60)
    print(f"Letterboxd - \\"{film_info['title']}\\" ({film_info['year']})")
    print("=" * 60)
    print(f"  Director: {film_info['director']}")
    print(f"  Average Rating: {film_info['avgRating']} / 5")
    print(f"\\n  Popular Reviews:")
    for idx, r in enumerate(reviews, 1):
        rating_str = f" [{r['rating']}]" if r['rating'] else ""
        snippet = r['review_snippet'][:120]
        if len(r['review_snippet']) > 120:
            snippet += "..."
        print(f"    {idx}. {r['reviewer_name']}{rating_str}")
        if snippet:
            print(f"       \\"{snippet}\\"")

    print(f"\\nFound {len(reviews)} reviews")
    return LetterboxdResult(
        film_title=film_info['title'],
        year=film_info['year'],
        director=film_info['director'],
        average_rating=film_info['avgRating'],
        reviews=[Review(**r) for r in reviews]
    )


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("letterboxd_com")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = letterboxd_search(page, LetterboxdRequest())
            print(f"\\nReturned {len(result.reviews or [])} reviews")
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
    const url = `https://letterboxd.com/film/${CFG.filmSlug}/`;
    console.log(`\n🌐 Navigating to ${url}...`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url, description: `Navigate to Letterboxd film page for "${CFG.filmTitle}"` });

    // Extract film info from meta tags
    const filmInfo = await page.evaluate(() => {
      const getMeta = (name) => {
        const el = document.querySelector(`meta[name="${name}"]`)
                 || document.querySelector(`meta[property="${name}"]`);
        return el ? el.content : "";
      };
      const ogTitle = getMeta("og:title");
      const match = ogTitle.match(/^(.+?)\s*\((\d{4})\)$/);
      const title = match ? match[1] : ogTitle;
      const year = match ? match[2] : "";
      const director = getMeta("twitter:data1");
      const ratingStr = getMeta("twitter:data2");
      const ratingMatch = ratingStr.match(/([\d.]+)\s+out of/);
      const avgRating = ratingMatch ? ratingMatch[1] : ratingStr;
      return { title, year, director, avgRating };
    });

    // Extract popular reviews
    const reviews = await page.evaluate((maxReviews) => {
      const articles = document.querySelectorAll("article.production-viewing");
      const results = [];
      for (let i = 0; i < Math.min(articles.length, maxReviews); i++) {
        const a = articles[i];
        const nameEl = a.querySelector("span.owner");
        const name = nameEl ? nameEl.innerText.trim() : "";
        const ratingSvg = a.querySelector("span.inline-rating svg");
        let rating = "";
        if (ratingSvg) {
          const label = ratingSvg.getAttribute("aria-label") || "";
          rating = label;
        }
        const bodyEl = a.querySelector(".js-review-body p");
        const snippet = bodyEl ? bodyEl.innerText.substring(0, 200).trim() : "";
        results.push({ reviewer_name: name, rating, review_snippet: snippet });
      }
      return results;
    }, CFG.maxReviews);

    recorder.record("extract", {
      instruction: "Extract film info and popular reviews",
      description: `Extracted film info and ${reviews.length} reviews`,
      results: { filmInfo, reviews },
    });

    console.log(`\n📋 ${filmInfo.title} (${filmInfo.year})`);
    console.log(`   Director: ${filmInfo.director}`);
    console.log(`   Average Rating: ${filmInfo.avgRating} / 5\n`);
    console.log(`   Popular Reviews:`);
    reviews.forEach((r, i) => {
      const ratingStr = r.rating ? ` [${r.rating}]` : "";
      const snippet = r.review_snippet.length > 120
        ? r.review_snippet.substring(0, 120) + "..."
        : r.review_snippet;
      console.log(`   ${i + 1}. ${r.reviewer_name}${ratingStr}`);
      if (snippet) console.log(`      "${snippet}"`);
    });

    const dir = path.join(__dirname);
    fs.writeFileSync(
      path.join(dir, "recorded_actions.json"),
      JSON.stringify(recorder.actions, null, 2)
    );
    console.log(`\n💾 Saved ${recorder.actions.length} actions`);

    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(dir, "letterboxd_search.py"), pyCode);
    console.log("🐍 Saved Python script");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
