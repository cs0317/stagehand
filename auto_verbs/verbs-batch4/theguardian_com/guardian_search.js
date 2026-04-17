const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient, observeAndAct } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");
const os = require("os");

/**
 * The Guardian – Article Search
 *
 * Uses AI-driven discovery to search The Guardian for articles.
 * The Guardian's own search form redirects to Google CSE, so we use
 * Google site-restricted search (site:theguardian.com) and then
 * visit each article to extract details.
 * Records interactions and generates a Python Playwright script.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  searchTerm: "climate change policy",
  maxResults: 5,
  waits: { page: 3000, article: 2000 },
};

// ── Python Script Generator ──────────────────────────────────────────────────
function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
The Guardian – Article Search
Search: "${cfg.searchTerm}"

Generated on: ${ts}
Recorded ${n} browser interactions

Uses Playwright's native locator API with CDP connection to real Chrome.
"""

import re
import os
import sys
import shutil
import json
import socket
import subprocess
import tempfile
import time
from urllib.request import urlopen
from urllib.parse import quote as url_quote
from playwright.sync_api import Playwright, sync_playwright


# ── Inline CDP utilities ─────────────────────────────────────────────────────

def get_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]

def get_temp_profile_dir(site: str = "default") -> str:
    tmp = os.path.join(tempfile.gettempdir(), f"{site}_chrome_profile_{os.getpid()}")
    os.makedirs(tmp, exist_ok=True)
    return tmp

def find_chrome_executable() -> str:
    for candidate in [
        os.environ.get("CHROME_PATH", ""),
        "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable",
        "/usr/bin/chromium-browser", "/usr/bin/chromium",
    ]:
        if candidate and os.path.isfile(candidate):
            return candidate
    raise FileNotFoundError("Could not find Chrome/Chromium.")

def launch_chrome(profile_dir: str, port: int, headless: bool = False) -> subprocess.Popen:
    chrome_path = find_chrome_executable()
    flags = [
        chrome_path, f"--remote-debugging-port={port}", f"--user-data-dir={profile_dir}",
        "--remote-allow-origins=*", "--no-first-run", "--no-default-browser-check",
        "--disable-dev-shm-usage", "--disable-gpu", "--disable-software-rasterizer",
        "--disable-blink-features=AutomationControlled", "--disable-extensions",
        "--disable-component-extensions-with-background-pages", "--disable-background-networking",
        "--disable-sync", "--disable-default-apps", "--mute-audio",
        "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding",
        "--disable-background-timer-throttling", "--disable-infobars",
        "--no-sandbox", "--window-size=1280,987", "about:blank",
    ]
    if headless:
        flags.insert(1, "--headless=new")
    return subprocess.Popen(flags, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

def wait_for_cdp_ws(port: int, timeout_s: float = 15.0) -> str:
    deadline = time.time() + timeout_s
    last_err = ""
    while time.time() < deadline:
        try:
            resp = urlopen(f"http://127.0.0.1:{port}/json/version", timeout=2)
            data = json.loads(resp.read())
            ws_url = data.get("webSocketDebuggerUrl", "")
            if ws_url:
                return ws_url
        except Exception as e:
            last_err = str(e)
        time.sleep(0.25)
    raise TimeoutError(f"Timed out waiting for Chrome CDP on port {port}: {last_err}")


# ── Main function ────────────────────────────────────────────────────────────

def search_guardian(
    playwright: Playwright,
    search_term: str = "${cfg.searchTerm}",
    max_results: int = ${cfg.maxResults},
) -> list[dict]:
    port = get_free_port()
    profile_dir = get_temp_profile_dir("theguardian")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        # Navigate to Google site-restricted search for theguardian.com
        search_url = f"https://www.google.com/search?q={url_quote(search_term)}+site%3Atheguardian.com"
        print(f"Loading {search_url}...")
        page.goto(search_url)
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(3000)

        # Extract article links from Google results
        link_els = page.locator('a[href*="theguardian.com"] h3')
        link_count = link_els.count()
        article_urls = []
        for i in range(min(link_count, max_results)):
            try:
                h3 = link_els.nth(i)
                parent_a = h3.locator("xpath=ancestor::a[1]")
                href = parent_a.get_attribute("href", timeout=2000)
                if href and "theguardian.com" in href:
                    article_urls.append(href)
            except Exception:
                continue

        # Visit each article and extract details
        for idx, url in enumerate(article_urls):
            try:
                page.goto(url)
                page.wait_for_load_state("domcontentloaded")
                page.wait_for_timeout(2000)

                # Dismiss consent banners
                for sel in ['button:has-text("Accept")', 'button:has-text("Yes")', 'button:has-text("OK")']:
                    try:
                        btn = page.locator(sel).first
                        if btn.is_visible(timeout=1000):
                            btn.click()
                            page.wait_for_timeout(500)
                            break
                    except Exception:
                        pass

                headline = "N/A"
                try:
                    headline = page.locator('h1').first.inner_text(timeout=3000).strip()
                except Exception:
                    pass

                author = "N/A"
                try:
                    author = page.locator('[rel="author"], address a').first.inner_text(timeout=2000).strip()
                except Exception:
                    pass

                pub_date = "N/A"
                try:
                    d_el = page.locator('time[datetime]').first
                    pub_date = d_el.get_attribute("datetime", timeout=2000) or d_el.inner_text(timeout=2000)
                    pub_date = pub_date.strip()
                except Exception:
                    try:
                        pub_date = page.evaluate("""() => {
                            const m = document.querySelector('meta[property="article:published_time"]');
                            return m ? m.content : "N/A";
                        }""")
                    except Exception:
                        pass

                summary = "N/A"
                try:
                    summary = page.locator('[data-gu-name="standfirst"] p, article p').first.inner_text(timeout=2000).strip()
                except Exception:
                    pass

                results.append({
                    "headline": headline,
                    "author": author,
                    "publication_date": pub_date,
                    "summary": summary[:200],
                })
            except Exception:
                continue

        print(f'Found {len(results)} articles for "{search_term}":')
        for i, a in enumerate(results, 1):
            print(f"  {i}. {a['headline']}")
            print(f"     Author: {a['author']}  Date: {a['publication_date']}")
            print(f"     Summary: {a['summary'][:100]}...")
    except Exception as e:
        print(f"Error: {e}")
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
        items = search_guardian(playwright)
        print(f"\\nTotal articles found: {len(items)}")
`;
}

// ── Step Functions ────────────────────────────────────────────────────────────

async function searchGoogle(stagehand, page, recorder, searchTerm) {
  console.log("🎯 STEP 1: Google site-restricted search...");

  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(searchTerm)}+site%3Atheguardian.com`;
  recorder.goto(searchUrl);
  await page.goto(searchUrl);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(CFG.waits.page);

  console.log(`   📍 URL: ${page.url()}`);
  recorder.record("navigate", {
    instruction: `Google search for "${searchTerm}" on theguardian.com`,
    description: "Navigate to Google site-restricted search",
    url: searchUrl,
  });
}

async function extractArticleLinks(stagehand, page, recorder) {
  console.log(`🎯 STEP 2: Extract up to ${CFG.maxResults} article links...`);
  const { z } = require("zod/v3");

  const data = await stagehand.extract(
    `Extract up to ${CFG.maxResults} article links from the Google search results. Only include links that go to theguardian.com articles.`,
    z.object({
      articles: z.array(z.object({
        title: z.string().describe("Article title from search result"),
        url: z.string().url().describe("URL to the Guardian article"),
      })).describe(`Up to ${CFG.maxResults} Guardian article links`),
    })
  );

  recorder.record("extract", {
    instruction: "Extract article links from Google results",
    description: `Extract up to ${CFG.maxResults} Guardian article URLs`,
    results: data,
  });

  console.log(`   📋 Found ${data.articles.length} articles`);
  data.articles.forEach((a, i) => {
    console.log(`   ${i + 1}. ${a.title}`);
  });

  return data.articles;
}

async function extractArticleDetails(stagehand, page, recorder, articles) {
  console.log(`\n🎯 STEP 3: Visit articles and extract details...`);
  const { z } = require("zod/v3");
  const results = [];

  for (let i = 0; i < Math.min(articles.length, CFG.maxResults); i++) {
    const article = articles[i];
    console.log(`\n   📰 Article ${i + 1}: ${article.title}`);
    console.log(`      URL: ${article.url}`);

    await page.goto(article.url);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(CFG.waits.article);

    // Dismiss consent banners
    try {
      await observeAndAct(stagehand, page, recorder,
        'If there is a cookie/consent banner, click Accept or OK to dismiss it',
        "Dismiss consent banner"
      );
    } catch (e) {
      // No banner to dismiss
    }

    const details = await stagehand.extract(
      `Extract the article details from this Guardian article page: headline, author/byline, publication date, and the first paragraph or standfirst summary.`,
      z.object({
        headline: z.string().describe("Article headline"),
        author: z.string().describe("Article author or byline"),
        publication_date: z.string().describe("Publication date"),
        summary: z.string().describe("Article standfirst or first paragraph"),
      })
    );

    recorder.record("extract", {
      instruction: `Extract details from article: ${article.title}`,
      description: "Extract headline, author, date, summary",
      results: details,
    });

    console.log(`      ✅ ${details.headline}`);
    console.log(`         Author: ${details.author}  Date: ${details.publication_date}`);
    results.push(details);
  }

  return results;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  The Guardian – Article Search");
  console.log("  🔍 AI-driven discovery + Playwright locators");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  🔎 Search: "${CFG.searchTerm}"`);
  console.log(`  📄 Max results: ${CFG.maxResults}\n`);

  const recorder = new PlaywrightRecorder();
  const llmClient = setupLLMClient("hybrid");
  let stagehand;

  try {
    console.log("🎭 Initializing Stagehand...");
    stagehand = new Stagehand({
      env: "LOCAL",
      verbose: 0,
      llmClient,
      localBrowserLaunchOptions: {
        headless: false,
        viewport: { width: 1920, height: 1080 },
        args: ["--disable-blink-features=AutomationControlled", "--disable-infobars", "--disable-extensions"],
      },
    });
    await stagehand.init();
    console.log("✅ Stagehand ready\n");

    const page = stagehand.context.pages()[0];

    await searchGoogle(stagehand, page, recorder, CFG.searchTerm);
    const articles = await extractArticleLinks(stagehand, page, recorder);
    const details = await extractArticleDetails(stagehand, page, recorder, articles);

    console.log("\n═══════════════════════════════════════════════════════════");
    console.log(`  ✅ DONE — ${details.length} articles extracted`);
    console.log("═══════════════════════════════════════════════════════════");
    details.forEach((d, i) => {
      console.log(`  ${i + 1}. ${d.headline}`);
      console.log(`     Author: ${d.author}  Date: ${d.publication_date}`);
    });

    // Save Python + JSON
    const pyScript = genPython(CFG, recorder);
    const pyPath = path.join(__dirname, "guardian_search.py");
    fs.writeFileSync(pyPath, pyScript, "utf-8");
    console.log(`\n✅ Python: ${pyPath}`);

    const jsonPath = path.join(__dirname, "recorded_actions.json");
    fs.writeFileSync(jsonPath, JSON.stringify(recorder.actions, null, 2), "utf-8");
    console.log(`📋 Actions: ${jsonPath}`);

    return details;

  } catch (err) {
    console.error("\n❌ Error:", err.message);
    if (recorder?.actions.length > 0) {
      const pyScript = genPython(CFG, recorder);
      fs.writeFileSync(path.join(__dirname, "guardian_search.py"), pyScript, "utf-8");
      console.log("⚠️  Partial Python saved");
    }
    throw err;
  } finally {
    if (stagehand) {
      console.log("🧹 Closing...");
      await stagehand.close();
    }
  }
}

main().catch(console.error);
