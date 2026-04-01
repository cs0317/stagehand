const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient, observeAndAct, extractAriaScopeForXPath } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");
const os = require("os");

/**
 * Google Scholar – Find Arxiv Links for a Paper
 *
 * Uses AI-driven discovery to search Google Scholar for a paper,
 * find its Arxiv link(s), and return them.
 * Records interactions and generates a Python Playwright script.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const CFG = {
  url: "https://scholar.google.com/",
  paperTitle: "nikolaj z3",
  author: "",
  maxResults: 5,
  waits: { page: 2000, type: 1500, search: 3000 },
};

// ── Python Script Generator ──────────────────────────────────────────────────
function genPython(cfg, recorder, arxivLinks) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Google Scholar – Find Arxiv Links for a Paper
Paper: "${cfg.paperTitle}" by ${cfg.author}

Generated on: ${ts}
Recorded ${n} browser interactions

Uses Playwright with CDP temp profile (no login required).
"""
import re
import os, sys, shutil, tempfile, subprocess, json, time
from dataclasses import dataclass
from playwright.sync_api import sync_playwright, Page
from urllib.request import urlopen

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, find_chrome_executable


@dataclass(frozen=True)
class ScholarPaperSearchRequest:
    paper_title: str
    author: str = ""
    max_results: int = ${cfg.maxResults}


@dataclass(frozen=True)
class ScholarArxivLink:
    title: str
    arxiv_url: str


@dataclass(frozen=True)
class ScholarPaperSearchResult:
    paper_title: str
    author: str
    links: list


def find_arxiv_links_for_paper(
    page: Page,
    request: ScholarPaperSearchRequest,
) -> ScholarPaperSearchResult:
    """Search Google Scholar for a paper and return Arxiv link(s)."""
    results = []

    try:
        # ── STEP 1: Navigate to Google Scholar ────────────────────────────
        print("STEP 1: Navigate to Google Scholar...")
        page.goto("${cfg.url}", wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(2000)

        # Dismiss any cookie/consent banners
        for sel in [
            "button#onetrust-accept-btn-handler",
            "button:has-text('Accept all')",
            "button:has-text('I agree')",
            "button:has-text('Accept')",
            "[aria-label='Close']",
        ]:
            try:
                btn = page.locator(sel).first
                if btn.is_visible(timeout=800):
                    btn.evaluate("el => el.click()")
                    page.wait_for_timeout(500)
            except Exception:
                pass

        # ── STEP 2: Enter search query ────────────────────────────────────
        query = request.paper_title
        if request.author:
            query += f" {request.author}"
        print(f'STEP 2: Search for "{query}"...')

        search_input = page.locator('input#gs_hdr_tsi, input[name="q"], textarea[name="q"]').first
        search_input.click()
        page.wait_for_timeout(300)
        page.keyboard.press("Control+a")
        search_input.type(query, delay=30)
        page.wait_for_timeout(500)

        # Press Enter or click search button
        page.keyboard.press("Enter")
        print("  Pressed Enter to search")
        page.wait_for_timeout(3000)
        page.wait_for_load_state("domcontentloaded")
        print(f"  URL: {page.url}")

        # ── STEP 3: Extract Arxiv links from results ─────────────────────
        print(f"STEP 3: Extract Arxiv links (up to {request.max_results})...")

        # Google Scholar results are in div.gs_r elements
        # Each result may have links to PDF sources including arxiv.org
        body = page.inner_text("body")

        # Strategy 1: Find all links containing arxiv.org
        all_links = page.eval_on_selector_all(
            'a[href*="arxiv.org"]',
            'els => els.map(e => ({href: e.href, text: (e.textContent || "").trim()}))'
        )
        for link in all_links:
            href = link.get("href", "")
            text = link.get("text", "")
            if "arxiv.org" in href and len(results) < request.max_results:
                results.append({"title": text or "Arxiv Link", "arxiv_url": href})

        # Strategy 2: Regex fallback on page text for arxiv URLs
        if not results:
            arxiv_pattern = r'https?://arxiv\\.org/(?:abs|pdf)/[\\w.]+(?:v\\d+)?'
            for m in re.finditer(arxiv_pattern, page.content()):
                url = m.group(0)
                if url not in [r["arxiv_url"] for r in results]:
                    results.append({"title": "Arxiv Link", "arxiv_url": url})
                    if len(results) >= request.max_results:
                        break

        # Strategy 3: Check each result card for "All versions" or side links
        if not results:
            print("  No direct arxiv links found, checking result cards...")
            result_blocks = page.locator("div.gs_r.gs_or, div.gs_ri")
            count = result_blocks.count()
            for i in range(min(count, request.max_results)):
                block = result_blocks.nth(i)
                try:
                    links = block.eval_on_selector_all(
                        'a',
                        'els => els.map(e => ({href: e.href, text: (e.textContent || "").trim()}))'
                    )
                    for link in links:
                        if "arxiv.org" in link.get("href", ""):
                            results.append({
                                "title": link.get("text", "Arxiv Link"),
                                "arxiv_url": link["href"],
                            })
                except Exception:
                    continue

        # Deduplicate by URL
        seen = set()
        unique = []
        for r in results:
            if r["arxiv_url"] not in seen:
                seen.add(r["arxiv_url"])
                unique.append(r)
        results = unique[:request.max_results]

        # ── Print results ─────────────────────────────────────────────────
        if results:
            print(f"\\nDONE – Found {len(results)} Arxiv link(s):")
            for i, r in enumerate(results, 1):
                print(f"  {i}. {r['title']}")
                print(f"     {r['arxiv_url']}")
        else:
            print("\\n❌ No Arxiv links found for this paper.")

    except Exception as e:
        import traceback
        print(f"Error: {e}")
        traceback.print_exc()

    return ScholarPaperSearchResult(
        paper_title=request.paper_title,
        author=request.author,
        links=[ScholarArxivLink(title=r["title"], arxiv_url=r["arxiv_url"]) for r in results],
    )


def test_scholar_paper_search():
    request = ScholarPaperSearchRequest(
        paper_title="${cfg.paperTitle}",
        author="${cfg.author}",
    )
    port = get_free_port()
    profile_dir = tempfile.mkdtemp(prefix="chrome_cdp_")
    chrome = os.environ.get("CHROME_PATH") or find_chrome_executable()
    chrome_proc = subprocess.Popen(
        [
            chrome,
            f"--remote-debugging-port={port}",
            f"--user-data-dir={profile_dir}",
            "--remote-allow-origins=*",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-blink-features=AutomationControlled",
            "--window-size=1280,987",
            "about:blank",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    ws_url = None
    deadline = time.time() + 15
    while time.time() < deadline:
        try:
            resp = urlopen(f"http://127.0.0.1:{port}/json/version", timeout=2)
            ws_url = json.loads(resp.read()).get("webSocketDebuggerUrl", "")
            if ws_url:
                break
        except Exception:
            pass
        time.sleep(0.4)
    if not ws_url:
        raise TimeoutError("Chrome CDP not ready")
    with sync_playwright() as pl:
        browser = pl.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = find_arxiv_links_for_paper(page, request)
        finally:
            chrome_proc.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)
    print(f"\\nFound {len(result.links)} Arxiv links")
    for link in result.links:
        print(f"  {link.arxiv_url}")


if __name__ == "__main__":
    test_scholar_paper_search()
`;
}

// ── Step Functions ───────────────────────────────────────────────────────────

async function dismissPopups(page) {
  console.log("🔲 Dismissing popups...");
  for (const sel of [
    "button#onetrust-accept-btn-handler",
    "button:has-text('Accept all')",
    "button:has-text('I agree')",
    "button:has-text('Accept')",
    "[aria-label='Close']",
  ]) {
    try {
      const btn = page.locator(sel);
      if (await btn.isVisible({ timeout: 1000 })) {
        await btn.click();
        console.log(`   ✅ Clicked: ${sel}`);
      }
    } catch (e) { /* no popup */ }
  }
  await page.waitForTimeout(500);
}

async function searchPaper(stagehand, page, recorder, paperTitle, author) {
  const query = author ? `${paperTitle} ${author}` : paperTitle;
  console.log(`🎯 STEP 1: Search for "${query}"...`);

  // Use page.evaluate for reliable form fill + submit on Google Scholar
  await page.evaluate((q) => {
    const input = document.getElementById('gs_hdr_tsi') || document.querySelector('input[name="q"]');
    if (input) {
      input.value = q;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, query);
  console.log(`   ✅ Typed query`);
  recorder.record("act", {
    instruction: `Type '${query}' into search`,
    description: `Fill search: ${query}`,
    method: "type",
  });
  await page.waitForTimeout(500);

  // Submit the form via evaluate
  await page.evaluate(() => {
    const btn = document.getElementById('gs_hdr_tsb') || document.querySelector('button[aria-label="Search"]');
    if (btn) btn.click();
    else {
      const form = document.querySelector('form');
      if (form) form.submit();
    }
  });
  console.log("   ✅ Submitted search");
  recorder.record("click", { selector: "button#gs_hdr_tsb", description: "Click Search button" });

  await page.waitForTimeout(CFG.waits.search);
  try {
    await page.waitForLoadState("domcontentloaded", { timeout: 15000 });
  } catch (e) { /* timeout is ok */ }
  await page.waitForTimeout(3000);
  console.log(`   📍 URL: ${page.url()}`);
}

async function extractArxivLinks(stagehand, page, recorder) {
  console.log(`🎯 STEP 2: Extract Arxiv links...\n`);
  const { z } = require("zod/v3");

  // First, let's see what's on the page — extract all links for debugging
  const allPageLinks = await page.evaluate(() => {
    const anchors = document.querySelectorAll('a');
    return Array.from(anchors).slice(0, 100).map(a => ({
      href: a.href,
      text: (a.textContent || "").trim().substring(0, 100),
    }));
  });
  console.log(`   Total links on page: ${allPageLinks.length}`);

  // Check for arxiv links specifically
  const arxivLinks = allPageLinks.filter(l => l.href.includes("arxiv.org"));
  console.log(`   Direct arxiv links: ${arxivLinks.length}`);
  for (const l of arxivLinks) {
    console.log(`   🔗 ${l.text}: ${l.href}`);
  }

  if (arxivLinks.length > 0) {
    recorder.record("extract", {
      instruction: "Extract arxiv links from search results",
      description: `Found ${arxivLinks.length} arxiv links via DOM`,
      results: arxivLinks,
    });
    return arxivLinks;
  }

  // Check for links to PDF sources on the right side (e.g., [PDF] links)
  const pdfLinks = allPageLinks.filter(l =>
    l.text.includes("[PDF]") || l.text.includes("[HTML]") ||
    l.href.includes("arxiv") || l.href.includes("pdf")
  );
  console.log(`\n   PDF/source links: ${pdfLinks.length}`);
  for (const l of pdfLinks) {
    console.log(`   📄 ${l.text}: ${l.href}`);
  }

  // Extract result titles and their associated links
  const resultData = await page.evaluate(() => {
    const results = [];
    const cards = document.querySelectorAll('.gs_r.gs_or.gs_scl, .gs_ri');
    for (const card of cards) {
      const titleEl = card.querySelector('h3 a, .gs_rt a');
      if (!titleEl) continue;
      const title = (titleEl.textContent || "").trim();
      const url = titleEl.href;
      // Look for side links (PDF, arxiv, etc.)
      const sideLinks = [];
      const sideLinkEls = card.querySelectorAll('.gs_or_ggsm a, .gs_ggsd a, a[href*="arxiv"], .gs_ctg2 a');
      for (const el of sideLinkEls) {
        sideLinks.push({ href: el.href, text: (el.textContent || "").trim() });
      }
      // Also check all links in the card
      const allCardLinks = card.querySelectorAll('a');
      for (const el of allCardLinks) {
        if (el.href.includes("arxiv.org")) {
          sideLinks.push({ href: el.href, text: (el.textContent || "").trim() });
        }
      }
      results.push({ title, url, sideLinks });
    }
    return results;
  });

  console.log(`\n   Search results found: ${resultData.length}`);
  for (const r of resultData) {
    console.log(`   📄 ${r.title}`);
    console.log(`      Main link: ${r.url}`);
    for (const sl of r.sideLinks) {
      console.log(`      Side: ${sl.text} → ${sl.href}`);
    }
  }

  // Collect any arxiv links from result cards
  const foundArxiv = [];
  for (const r of resultData) {
    // Check main URL
    if (r.url.includes("arxiv.org")) {
      foundArxiv.push({ href: r.url, text: r.title });
    }
    // Check side links
    for (const sl of r.sideLinks) {
      if (sl.href.includes("arxiv.org")) {
        foundArxiv.push({ href: sl.href, text: sl.text || r.title });
      }
    }
  }

  if (foundArxiv.length > 0) {
    // Deduplicate
    const seen = new Set();
    const unique = foundArxiv.filter(l => {
      if (seen.has(l.href)) return false;
      seen.add(l.href);
      return true;
    });
    console.log(`\n   ✅ Found ${unique.length} arxiv link(s) from results`);
    recorder.record("extract", {
      instruction: "Extract arxiv links from search result cards",
      description: `Found ${unique.length} arxiv links`,
      results: unique,
    });
    return unique;
  }

  // Use Stagehand AI extraction as final fallback
  console.log("\n   No arxiv links in result cards, checking 'All versions'...");

  // Google Scholar has "All X versions" links — click the first one to see all indexed versions
  const allVersionsLinks = await page.evaluate(() => {
    const links = [];
    const versionEls = document.querySelectorAll('a');
    for (const a of versionEls) {
      const text = (a.textContent || "").trim();
      if (/all\s+\d+\s+versions/i.test(text) || text === "All versions") {
        links.push({ href: a.href, text });
      }
    }
    return links;
  });

  console.log(`   "All versions" links found: ${allVersionsLinks.length}`);
  for (const l of allVersionsLinks) {
    console.log(`   📎 ${l.text}: ${l.href}`);
  }

  if (allVersionsLinks.length > 0) {
    // Navigate to "All versions" page to find arxiv
    console.log(`   Navigating to: ${allVersionsLinks[0].href}`);
    await page.goto(allVersionsLinks[0].href);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3000);
    console.log(`   📍 URL: ${page.url()}`);

    // Now look for arxiv links on the "All versions" page
    const versionLinks = await page.evaluate(() => {
      const anchors = document.querySelectorAll('a');
      return Array.from(anchors).map(a => ({
        href: a.href,
        text: (a.textContent || "").trim().substring(0, 120),
      })).filter(l => l.href.includes("arxiv.org"));
    });

    if (versionLinks.length > 0) {
      // Deduplicate
      const seen = new Set();
      const unique = versionLinks.filter(l => {
        if (seen.has(l.href)) return false;
        seen.add(l.href);
        return true;
      });
      console.log(`   ✅ Found ${unique.length} arxiv link(s) in "All versions"`);
      for (const l of unique) {
        console.log(`   🔗 ${l.text}: ${l.href}`);
      }
      recorder.record("extract", {
        instruction: "Extract arxiv links from 'All versions' page",
        description: `Found ${unique.length} arxiv links`,
        results: unique,
      });
      return unique;
    }

    // Also extract all result cards on the versions page
    const versionResults = await page.evaluate(() => {
      const results = [];
      const cards = document.querySelectorAll('.gs_r.gs_or.gs_scl, .gs_ri, .gs_r');
      for (const card of cards) {
        const titleEl = card.querySelector('h3 a, .gs_rt a');
        if (!titleEl) continue;
        const title = (titleEl.textContent || "").trim();
        const url = titleEl.href;
        const allCardLinks = Array.from(card.querySelectorAll('a')).map(a => ({
          href: a.href, text: (a.textContent || "").trim()
        }));
        results.push({ title, url, links: allCardLinks });
      }
      return results;
    });

    console.log(`   Version page results: ${versionResults.length}`);
    const versionArxiv = [];
    for (const r of versionResults) {
      console.log(`   📄 ${r.title}`);
      console.log(`      Main: ${r.url}`);
      if (r.url.includes("arxiv.org")) {
        versionArxiv.push({ href: r.url, text: r.title });
      }
      for (const l of r.links) {
        if (l.href.includes("arxiv.org")) {
          console.log(`      🔗 ${l.text}: ${l.href}`);
          versionArxiv.push({ href: l.href, text: l.text || r.title });
        }
      }
    }

    if (versionArxiv.length > 0) {
      const seen = new Set();
      const unique = versionArxiv.filter(l => {
        if (seen.has(l.href)) return false;
        seen.add(l.href);
        return true;
      });
      console.log(`   ✅ Found ${unique.length} arxiv link(s) from version results`);
      recorder.record("extract", {
        instruction: "Extract arxiv links from 'All versions' results",
        description: `Found ${unique.length} arxiv links`,
        results: unique,
      });
      return unique;
    }

    console.log("   No arxiv links found in 'All versions' either");
  }

  // AI extraction as last resort
  console.log("\n   Using AI extraction as fallback...");
  const extracted = await stagehand.extract(
    `Look at the Google Scholar search results on this page. For each result, extract the paper title and any link URL that points to arxiv.org. Include PDF links from arxiv. If no arxiv links exist, return an empty array.`,
    z.object({
      papers: z.array(z.object({
        title: z.string().describe("Paper title"),
        arxivUrl: z.string().describe("URL containing arxiv.org, or empty string if none"),
      })).describe("Papers with arxiv links"),
    })
  );

  const aiResults = extracted.papers.filter(p => p.arxivUrl && p.arxivUrl.includes("arxiv.org"));
  recorder.record("extract", {
    instruction: "Extract arxiv links via AI",
    description: `Found ${aiResults.length} papers with arxiv links`,
    results: aiResults,
  });

  console.log(`📋 AI found ${aiResults.length} paper(s) with Arxiv links:`);
  for (const p of aiResults) {
    console.log(`   📄 ${p.title}`);
    console.log(`   🔗 ${p.arxivUrl}`);
  }

  return aiResults.map(p => ({ href: p.arxivUrl, text: p.title }));
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Google Scholar – Find Arxiv Links for a Paper");
  console.log("  🔍 AI-driven discovery + Playwright locators");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  📄 Paper: "${CFG.paperTitle}"`);
  console.log(`  👤 Author: ${CFG.author}\n`);

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
        userDataDir: path.join(os.homedir(), "AppData", "Local", "Google", "Chrome", "User Data", "Default"),
        headless: false,
        viewport: { width: 1920, height: 1080 },
        args: [
          "--disable-blink-features=AutomationControlled",
          "--disable-infobars",
          "--disable-extensions",
          "--start-maximized",
          "--window-size=1920,1080",
        ],
      },
    });
    await stagehand.init();
    console.log("✅ Stagehand ready\n");

    const page = stagehand.context.pages()[0];

    // Navigate to Google Scholar
    console.log("🌐 Loading Google Scholar...");
    recorder.goto(CFG.url);
    await page.goto(CFG.url);
    await page.waitForLoadState("domcontentloaded");
    console.log("✅ Loaded\n");
    recorder.wait(CFG.waits.page, "Initial page load");
    await page.waitForTimeout(CFG.waits.page);

    await dismissPopups(page);
    await searchPaper(stagehand, page, recorder, CFG.paperTitle, CFG.author);

    const arxivLinks = await extractArxivLinks(stagehand, page, recorder);

    console.log("\n═══════════════════════════════════════════════════════════");
    console.log(`  ✅ DONE — ${arxivLinks.length} Arxiv link(s) found`);
    console.log("═══════════════════════════════════════════════════════════");
    arxivLinks.forEach((l, i) => {
      console.log(`  ${i + 1}. ${l.text || "Arxiv"}: ${l.href}`);
    });

    // Save Python + JSON
    const pyScript = genPython(CFG, recorder, arxivLinks);
    const pyPath = path.join(__dirname, "scholar_findArxivLinks.py");
    fs.writeFileSync(pyPath, pyScript, "utf-8");
    console.log(`\n✅ Python: ${pyPath}`);

    const jsonPath = path.join(__dirname, "recorded_actions.json");
    fs.writeFileSync(jsonPath, JSON.stringify(recorder.actions, null, 2), "utf-8");
    console.log(`📋 Actions: ${jsonPath}`);

    return arxivLinks;

  } catch (err) {
    console.error("\n❌ Error:", err.message);
    if (recorder?.actions.length > 0) {
      const pyScript = genPython(CFG, recorder, []);
      fs.writeFileSync(path.join(__dirname, "scholar_findArxivLinks.py"), pyScript, "utf-8");
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
