const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient, observeAndAct } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");
const os = require("os");

/**
 * TechCrunch – Article Search
 *
 * Uses AI-driven discovery to search TechCrunch for articles.
 * TechCrunch uses WordPress-based loop-card components for search results.
 * Records interactions and generates a Python Playwright script.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  url: "https://techcrunch.com",
  searchTerm: "artificial intelligence startup",
  maxResults: 5,
  waits: { page: 3000, type: 1000 },
};

// ── Python Script Generator ──────────────────────────────────────────────────
function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
TechCrunch – Article Search
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


# ── Inline CDP utilities (same as other verbs) ───────────────────────────────

def get_free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]

def get_temp_profile_dir(site="default"):
    tmp = os.path.join(tempfile.gettempdir(), f"{site}_chrome_profile_{os.getpid()}")
    os.makedirs(tmp, exist_ok=True)
    return tmp

def find_chrome_executable():
    for c in [os.environ.get("CHROME_PATH",""), "/usr/bin/google-chrome", "/usr/bin/chromium-browser"]:
        if c and os.path.isfile(c): return c
    raise FileNotFoundError("Chrome not found")

def launch_chrome(profile_dir, port, headless=False):
    chrome = find_chrome_executable()
    flags = [chrome, f"--remote-debugging-port={port}", f"--user-data-dir={profile_dir}",
        "--remote-allow-origins=*", "--no-first-run", "--no-default-browser-check",
        "--disable-dev-shm-usage", "--disable-gpu", "--no-sandbox", "--window-size=1280,987", "about:blank"]
    if headless: flags.insert(1, "--headless=new")
    return subprocess.Popen(flags, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

def wait_for_cdp_ws(port, timeout_s=15.0):
    import time as _t
    deadline = _t.time() + timeout_s
    while _t.time() < deadline:
        try:
            r = urlopen(f"http://127.0.0.1:{port}/json/version", timeout=2)
            ws = json.loads(r.read()).get("webSocketDebuggerUrl","")
            if ws: return ws
        except: pass
        _t.sleep(0.25)
    raise TimeoutError("CDP timeout")


def search_techcrunch(playwright, search_term="${cfg.searchTerm}", max_results=${cfg.maxResults}):
    port = get_free_port()
    profile_dir = get_temp_profile_dir("techcrunch")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        search_url = f"https://techcrunch.com/?s={url_quote(search_term)}"
        page.goto(search_url)
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(3000)

        # Dismiss consent
        for sel in ['#onetrust-accept-btn-handler', 'button:has-text("Accept All")']:
            try:
                btn = page.locator(sel).first
                if btn.is_visible(timeout=1000):
                    btn.click()
                    page.wait_for_timeout(500)
                    break
            except: pass

        # Extract from loop-card components
        cards = page.locator("div.loop-card__content")
        seen = set()
        for i in range(cards.count()):
            if len(results) >= max_results: break
            card = cards.nth(i)
            try:
                headline = card.locator("a.loop-card__title-link, h3 a").first.inner_text(timeout=2000).strip()
                if not headline or headline.lower() in seen: continue
                seen.add(headline.lower())
                author = "N/A"
                try: author = card.locator("ul.loop-card__author-list a").first.inner_text(timeout=2000).strip()
                except: pass
                pub_date = "N/A"
                try:
                    d = card.locator("time[datetime]").first
                    pub_date = (d.get_attribute("datetime", timeout=2000) or d.inner_text(timeout=2000)).strip()
                except: pass
                results.append({"headline": headline, "author": author, "publication_date": pub_date})
            except: continue

        for i, a in enumerate(results, 1):
            print(f"  {i}. {a['headline']}")
            print(f"     Author: {a['author']}  Date: {a['publication_date']}")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        try: browser.close()
        except: pass
        chrome_proc.terminate()
        shutil.rmtree(profile_dir, ignore_errors=True)
    return results


if __name__ == "__main__":
    with sync_playwright() as pw:
        items = search_techcrunch(pw)
        print(f"\\nTotal: {len(items)}")
`;
}

// ── Step Functions ────────────────────────────────────────────────────────────

async function navigateToSearch(stagehand, page, recorder, searchTerm) {
  console.log("🎯 STEP 1: Navigate to TechCrunch search...");

  const searchUrl = `${CFG.url}/?s=${encodeURIComponent(searchTerm)}`;
  recorder.goto(searchUrl);
  await page.goto(searchUrl);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(CFG.waits.page);

  console.log(`   📍 URL: ${page.url()}`);
  recorder.record("navigate", {
    instruction: `Search TechCrunch for "${searchTerm}"`,
    description: "Navigate to TechCrunch search results",
    url: searchUrl,
  });
}

async function dismissPopups(page) {
  try {
    const btn = page.locator('#onetrust-accept-btn-handler');
    if (await btn.isVisible({ timeout: 2000 })) {
      await btn.click();
      await page.waitForTimeout(500);
      console.log("   ✅ Dismissed consent banner");
    }
  } catch (e) {
    // No banner
  }
}

async function extractArticles(stagehand, page, recorder) {
  console.log(`🎯 STEP 2: Extract up to ${CFG.maxResults} articles...\n`);
  const { z } = require("zod/v3");

  const listings = await stagehand.extract(
    `Extract up to ${CFG.maxResults} article search results from the TechCrunch search page. For each article, get the headline, author name, and publication date.`,
    z.object({
      articles: z.array(z.object({
        headline: z.string().describe("Article headline"),
        author: z.string().describe("Author name"),
        publication_date: z.string().describe("Publication date (ISO format if available)"),
      })).describe(`Up to ${CFG.maxResults} articles`),
    })
  );

  recorder.record("extract", {
    instruction: "Extract article search results",
    description: `Extract up to ${CFG.maxResults} articles`,
    results: listings,
  });

  console.log(`📋 Found ${listings.articles.length} articles:`);
  listings.articles.forEach((a, i) => {
    console.log(`   ${i + 1}. ${a.headline}`);
    console.log(`      Author: ${a.author}  Date: ${a.publication_date}`);
  });

  return listings;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  TechCrunch – Article Search");
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

    await navigateToSearch(stagehand, page, recorder, CFG.searchTerm);
    await dismissPopups(page);
    const listings = await extractArticles(stagehand, page, recorder);

    console.log("\n═══════════════════════════════════════════════════════════");
    console.log(`  ✅ DONE — ${listings.articles.length} articles found`);
    console.log("═══════════════════════════════════════════════════════════");

    // Save Python + JSON
    const pyScript = genPython(CFG, recorder);
    const pyPath = path.join(__dirname, "techcrunch_search.py");
    fs.writeFileSync(pyPath, pyScript, "utf-8");
    console.log(`\n✅ Python: ${pyPath}`);

    const jsonPath = path.join(__dirname, "recorded_actions.json");
    fs.writeFileSync(jsonPath, JSON.stringify(recorder.actions, null, 2), "utf-8");
    console.log(`📋 Actions: ${jsonPath}`);

    return listings;

  } catch (err) {
    console.error("\n❌ Error:", err.message);
    throw err;
  } finally {
    if (stagehand) {
      console.log("🧹 Closing...");
      await stagehand.close();
    }
  }
}

main().catch(console.error);
