const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient, observeAndAct } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");
const os = require("os");

/**
 * arXiv.org – Search Research Papers
 *
 * Uses AI-driven discovery to search arxiv.org for research papers.
 * Records interactions and generates a Python Playwright script.
 * Does not take any screenshots.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  url: "https://arxiv.org",
  query: "transformer architecture",
  maxResults: 5,
  waits: { page: 3000, type: 1000, search: 5000 },
};

// ── Python Script Generator ──────────────────────────────────────────────────
function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
arXiv.org – Search Research Papers
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
    profile_dir = get_temp_profile_dir("arxiv_org")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)
    browser = playwright.chromium.connect_over_cdp(ws_url)
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    results = []

    try:
        # ── Navigate ──────────────────────────────────────────────────────
        print("Loading arXiv.org...")
        page.goto("${cfg.url}")
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(2000)
        print(f"  Loaded: {page.url}")

        # ── STEP 1: Enter search query ────────────────────────────────────
        print(f'STEP 1: Search for "{query}"...')

        # arXiv has a search input with name="query" and placeholder="Search..."
        search_input = page.locator('input[name="query"][aria-label="Search term or terms"]').first
        search_input.click()
        page.wait_for_timeout(500)
        page.keyboard.press("Control+a")
        search_input.type(query, delay=50)
        print(f'  Typed "{query}"')
        page.wait_for_timeout(1000)

        # ── STEP 2: Click Search ──────────────────────────────────────────
        print("STEP 2: Submitting search...")

        # The search form has a button with class "is-small is-cul-darker"
        search_btn = page.locator('form[action="https://arxiv.org/search"] button[type="submit"], form.mini-search button').first
        search_btn.click()
        print("  Clicked Search button")

        # Wait for results page
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(3000)
        print(f"  URL: {page.url}")

        # ── STEP 3: Extract papers ────────────────────────────────────────
        print(f"STEP 3: Extract up to {max_results} papers...")

        # arXiv results are in <li class="arxiv-result"> elements
        paper_cards = page.locator("li.arxiv-result")
        count = paper_cards.count()
        print(f"  Found {count} paper cards on page")

        for i in range(min(count, max_results)):
            card = paper_cards.nth(i)
            try:
                # Title: <p class="title is-5 mathjax">
                title = "N/A"
                try:
                    title_el = card.locator("p.title").first
                    title = title_el.inner_text(timeout=3000).strip()
                except Exception:
                    pass

                # Authors: <p class="authors"> contains links
                authors = "N/A"
                try:
                    authors_el = card.locator("p.authors").first
                    authors_text = authors_el.inner_text(timeout=3000).strip()
                    # Remove the "Authors:" prefix
                    authors = re.sub(r"^Authors:\\s*", "", authors_text).strip()
                except Exception:
                    pass

                # Abstract snippet: <span class="abstract-short">
                abstract = "N/A"
                try:
                    abstract_el = card.locator("span.abstract-short").first
                    abstract_text = abstract_el.inner_text(timeout=3000).strip()
                    # Remove trailing "▽ More" link text
                    abstract = re.sub(r"\\s*▽\\s*More\\s*$", "", abstract_text).strip()
                    # Remove leading "…"
                    abstract = re.sub(r"^…\\s*", "", abstract).strip()
                except Exception:
                    # Fallback: try the full abstract
                    try:
                        abstract_el = card.locator("p.abstract").first
                        abstract = abstract_el.inner_text(timeout=3000).strip()
                        abstract = re.sub(r"^Abstract:\\s*", "", abstract).strip()
                        abstract = re.sub(r"\\s*▽\\s*More\\s*$", "", abstract).strip()
                        abstract = re.sub(r"\\s*△\\s*Less\\s*$", "", abstract).strip()
                    except Exception:
                        pass

                # Submission date: text like "Submitted 14 April, 2026;"
                date = "N/A"
                try:
                    # The date is in a <p class="is-size-7"> inside the card
                    date_els = card.locator("p.is-size-7")
                    for j in range(date_els.count()):
                        date_text = date_els.nth(j).inner_text(timeout=2000).strip()
                        m = re.search(r"Submitted\\s+(.+?);", date_text)
                        if m:
                            date = m.group(1).strip()
                            break
                except Exception:
                    pass

                if title == "N/A":
                    continue

                results.append({
                    "title": title,
                    "authors": authors,
                    "abstract": abstract[:200] + ("..." if len(abstract) > 200 else ""),
                    "date": date,
                })
            except Exception:
                continue

        # ── Print results ─────────────────────────────────────────────────
        print(f"\\nFound {len(results)} papers for '{query}':\\n")
        for i, paper in enumerate(results, 1):
            print(f"  {i}. {paper['title']}")
            print(f"     Authors: {paper['authors']}")
            print(f"     Date: {paper['date']}")
            print(f"     Abstract: {paper['abstract']}")
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
        print(f"\\nTotal papers found: {len(items)}")
`;
}

// ── Step Functions ───────────────────────────────────────────────────────────

async function enterQuery(stagehand, page, recorder, query) {
  console.log(`🎯 STEP 1: Search for "${query}"...`);

  // Use stagehand.act() to interact with the search input
  await stagehand.act(`Click on the search input field at the top of the page`);
  await page.waitForTimeout(500);
  await stagehand.act(`Clear the search input field and type '${query}'`);
  console.log(`   ✅ Typed "${query}"`);
  recorder.record("act", {
    instruction: `Type '${query}' into search`,
    description: `Fill search query: ${query}`,
    method: "type",
  });
  await page.waitForTimeout(CFG.waits.type);
}

async function clickSearch(stagehand, page, recorder) {
  console.log("🎯 STEP 2: Click Search...");

  // Click the search button
  await stagehand.act("Click the Search button to submit the search query");
  console.log("   ✅ Clicked Search button");
  recorder.record("act", {
    instruction: "Click Search button",
    description: "Submit search form",
    method: "click",
  });

  // Wait for results
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(CFG.waits.search);
  console.log(`   📍 URL: ${page.url()}`);
}

async function extractPapers(stagehand, page, recorder) {
  console.log(`🎯 STEP 3: Extract up to ${CFG.maxResults} papers...\n`);
  const { z } = require("zod/v3");

  const listings = await stagehand.extract(
    `Extract up to ${CFG.maxResults} research paper results from this arXiv search page. For each paper, get the title, authors (comma-separated list), a short abstract snippet (first ~200 characters), and the submission date.`,
    z.object({
      papers: z.array(z.object({
        title: z.string().describe("Paper title"),
        authors: z.string().describe("Comma-separated author names"),
        abstract: z.string().describe("Abstract snippet, first ~200 chars"),
        date: z.string().describe("Submission date, e.g. '14 April, 2026'"),
      })).describe(`Up to ${CFG.maxResults} papers`),
    })
  );

  recorder.record("extract", {
    instruction: "Extract paper search results",
    description: `Extract up to ${CFG.maxResults} papers`,
    results: listings,
  });

  console.log(`📋 Found ${listings.papers.length} papers:`);
  listings.papers.forEach((p, i) => {
    console.log(`   ${i + 1}. ${p.title}`);
    console.log(`      Authors: ${p.authors}`);
    console.log(`      Date: ${p.date}`);
    console.log(`      Abstract: ${p.abstract.substring(0, 150)}...`);
  });

  return listings;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  arXiv.org – Search Research Papers");
  console.log("  🔍 AI-driven discovery + Playwright locators");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  📝 Query: ${CFG.query}`);
  console.log(`  📊 Max results: ${CFG.maxResults}\n`);

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
        args: ["--disable-blink-features=AutomationControlled", "--disable-infobars", "--start-maximized"],
      },
    });
    await stagehand.init();
    console.log("✅ Stagehand ready\n");

    const page = stagehand.context.pages()[0];

    // Navigate
    console.log("🌐 Loading arXiv.org...");
    recorder.goto(CFG.url);
    await page.goto(CFG.url);
    await page.waitForLoadState("domcontentloaded");
    console.log("✅ Loaded\n");
    recorder.wait(CFG.waits.page, "Initial page load");
    await page.waitForTimeout(CFG.waits.page);

    await enterQuery(stagehand, page, recorder, CFG.query);
    await clickSearch(stagehand, page, recorder);

    const listings = await extractPapers(stagehand, page, recorder);

    console.log("\n═══════════════════════════════════════════════════════════");
    console.log(`  ✅ DONE — ${listings.papers.length} papers found`);
    console.log("═══════════════════════════════════════════════════════════");
    listings.papers.forEach((p, i) => {
      console.log(`  ${i + 1}. ${p.title}`);
      console.log(`     Authors: ${p.authors}`);
      console.log(`     Date: ${p.date}`);
    });

    // Save Python + JSON
    const pyScript = genPython(CFG, recorder);
    const pyPath = path.join(__dirname, "arxiv_search.py");
    fs.writeFileSync(pyPath, pyScript, "utf-8");
    console.log(`\n✅ Python: ${pyPath}`);

    const jsonPath = path.join(__dirname, "recorded_actions.json");
    fs.writeFileSync(jsonPath, JSON.stringify(recorder.actions, null, 2), "utf-8");
    console.log(`📋 Actions: ${jsonPath}`);

    return listings;

  } catch (err) {
    console.error("\n❌ Error:", err.message);
    if (recorder?.actions.length > 0) {
      const pyScript = genPython(CFG, recorder);
      fs.writeFileSync(path.join(__dirname, "arxiv_search.py"), pyScript, "utf-8");
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

if (require.main === module) {
  main().then(() => { console.log("🎊 Done!"); process.exit(0); }).catch((e) => { console.error("💥", e.message); process.exit(1); });
}
module.exports = { main };
