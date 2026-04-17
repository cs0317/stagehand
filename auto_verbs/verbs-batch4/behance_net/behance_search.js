/**
 * Behance – Creative Project Search
 *
 * Prompt:
 *   Search for creative projects matching "brand identity".
 *   Extract up to 5 projects with project title, creator name,
 *   number of appreciations (likes), and view count.
 *
 * Strategy:
 *   Direct URL: behance.net/search/projects?search=<query>
 *   Then use Stagehand extract to pull project details.
 */

const { Stagehand } = require("@browserbasehq/stagehand");
const { z } = require("zod");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");

/* ── kill switch ─────────────────────────────────────────── */
const TIMEOUT = 150_000;
setTimeout(() => { console.error("\n⏰ Global timeout – exiting"); process.exit(1); }, TIMEOUT);

/* ── config ──────────────────────────────────────────────── */
const CFG = {
  query: "brand identity",
  maxItems: 5,
};

/* ── genPython ───────────────────────────────────────────── */
function genPython(cfg, recorder, extractedProjects) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;

  // Build the concrete extraction selectors/logic based on what we observed
  return `"""
Auto-generated Playwright script (Python)
Behance – Creative Project Search
Search for creative projects and extract project details.

Generated on: ${ts}
Recorded ${n} browser interactions
"""

import re
import os
from dataclasses import dataclass
from urllib.parse import quote_plus
from playwright.sync_api import sync_playwright, Page

import sys as _sys
import os as _os
_sys.path.insert(0, _os.path.join(_os.path.dirname(__file__), ".."))
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class BehanceSearchRequest:
    search_query: str = "${cfg.query}"
    max_results: int = ${cfg.maxItems}


@dataclass(frozen=True)
class BehanceProject:
    title: str = ""
    creator: str = ""
    appreciations: str = ""
    views: str = ""


@dataclass(frozen=True)
class BehanceSearchResult:
    projects: list = None  # list[BehanceProject]


def behance_search(page: Page, request: BehanceSearchRequest) -> BehanceSearchResult:
    query = request.search_query
    max_results = request.max_results
    print(f"  Search query: {query}")
    print(f"  Max results: {max_results}\\n")

    url = f"https://www.behance.net/search/projects?search={quote_plus(query)}"
    print(f"Loading {url}...")
    checkpoint(f"Navigate to {url}")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(8000)
    print(f"  Loaded: {page.url}")

    body_text = page.evaluate("document.body ? document.body.innerText : ''") or ""

    results = []

    # Try structured extraction via project card elements
    cards = page.locator(
        '[class*="ProjectCover"], '
        '[class*="project-cover"], '
        '[class*="ProjectCard"], '
        'a[href*="/gallery/"]'
    )
    count = cards.count()
    print(f"  Found {count} project cards via selectors")

    if count > 0:
        for i in range(min(count, max_results)):
            card = cards.nth(i)
            try:
                card_text = card.inner_text(timeout=3000).strip()
                lines = [l.strip() for l in card_text.split("\\n") if l.strip()]

                title = "N/A"
                creator = "N/A"
                appreciations = "N/A"
                views = "N/A"

                for line in lines:
                    am = re.search(r'^[\\d,]+$', line)
                    if am and appreciations == "N/A":
                        appreciations = am.group(0)
                        continue
                    vm = re.search(r'^[\\d,.]+[kKmM]?$', line)
                    if vm and appreciations != "N/A" and views == "N/A":
                        views = vm.group(0)
                        continue
                    if len(line) > 3 and not re.match(r'^[\\d,]+$', line):
                        if title == "N/A" or len(line) > len(title):
                            if creator == "N/A" and title != "N/A":
                                creator = title
                            title = line

                if title != "N/A":
                    results.append(BehanceProject(
                        title=title,
                        creator=creator,
                        appreciations=appreciations,
                        views=views,
                    ))
            except Exception:
                continue

    # Fallback: text-based extraction
    if not results:
        print("  Card selectors missed, trying text-based extraction...")
        text_lines = [l.strip() for l in body_text.split("\\n") if l.strip()]

        i = 0
        while i < len(text_lines) and len(results) < max_results:
            line = text_lines[i]
            if len(line) > 10 and not re.match(r'^[\\d,.$%]+$', line):
                title = line
                creator = "N/A"
                appreciations = "N/A"
                views = "N/A"

                for j in range(i + 1, min(len(text_lines), i + 6)):
                    nearby = text_lines[j]
                    nm = re.match(r'^([\\d,]+[kKmM]?)$', nearby)
                    if nm:
                        if appreciations == "N/A":
                            appreciations = nm.group(1)
                        elif views == "N/A":
                            views = nm.group(1)
                        continue
                    if (len(nearby) > 2 and len(nearby) < 50
                            and not re.match(r'^[\\d,]+$', nearby)
                            and creator == "N/A"):
                        creator = nearby

                if title != "N/A":
                    results.append(BehanceProject(
                        title=title,
                        creator=creator,
                        appreciations=appreciations,
                        views=views,
                    ))
                    i += 5
                    continue
            i += 1

        results = results[:max_results]

    print("=" * 60)
    print(f'Behance - Search Results for "{query}"')
    print("=" * 60)
    for idx, p in enumerate(results, 1):
        print(f"\\n{idx}. {p.title}")
        print(f"   Creator: {p.creator}")
        print(f"   Appreciations: {p.appreciations}")
        print(f"   Views: {p.views}")

    print(f"\\nFound {len(results)} projects")

    return BehanceSearchResult(projects=results)


def test_func():
    import subprocess, time
    subprocess.call("taskkill /f /im chrome.exe", stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(2)
    chrome_user_data = os.path.join(
        os.environ["USERPROFILE"], "AppData", "Local", "Google", "Chrome", "User Data", "Default"
    )
    with sync_playwright() as pw:
        context = pw.chromium.launch_persistent_context(
            chrome_user_data,
            channel="chrome",
            headless=False,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--disable-infobars",
                "--disable-extensions",
            ],
        )
        page = context.pages[0] if context.pages else context.new_page()
        result = behance_search(page, BehanceSearchRequest())
        print(f"\\nReturned {len(result.projects or [])} projects")
        context.close()


if __name__ == "__main__":
    from playwright_debugger import run_with_debugger
    run_with_debugger(test_func)
`;
}

/* ── main ────────────────────────────────────────────────── */
(async () => {
  const llmClient = setupLLMClient();

  const stagehand = new Stagehand({
    env: "LOCAL",
    verbose: 1,
    llmClient: llmClient,
    localBrowserLaunchOptions: {
      headless: false,
      channel: "chrome",
      args: ["--disable-blink-features=AutomationControlled"],
    },
  });
  await stagehand.init();

  const page = stagehand.context.pages()[0];
  const recorder = new PlaywrightRecorder();

  try {
    // ── Navigate to Behance search ───────────────────────────────────
    const url = `https://www.behance.net/search/projects?search=${encodeURIComponent(CFG.query)}`;
    console.log(`🌐 Navigating to Behance search: ${url}`);
    recorder.record("navigate", { url });
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(5000);
    console.log(`   ✅ Loaded: ${page.url()}`);

    // ── Check for bot detection ──────────────────────────────────────
    const bodyText = await page.evaluate(() => document.body?.innerText || "");
    if (bodyText.includes("CAPTCHA") ||
        bodyText.includes("Access Denied") ||
        bodyText.includes("automated access")) {
      console.log("🚫 Bot detection triggered. Stopping.");
      process.exit(1);
    }

    // ── Extract projects ─────────────────────────────────────────────
    console.log(`🎯 Extracting up to ${CFG.maxItems} projects...`);

    const data = await stagehand.extract(
      `Extract the first ${CFG.maxItems} creative projects from this Behance search results page. For each project get: project title, creator name, number of appreciations (likes), and view count.`,
      z.object({
        projects: z.array(z.object({
          title: z.string(),
          creator: z.string(),
          appreciations: z.string(),
          views: z.string(),
        })),
      })
    );

    console.log(`\n✅ Extracted ${data.projects.length} projects:`);
    data.projects.forEach((p, i) => {
      console.log(`  ${i + 1}. ${p.title}`);
      console.log(`     Creator: ${p.creator}`);
      console.log(`     Appreciations: ${p.appreciations}  Views: ${p.views}`);
    });

    // ── Generate Python ──────────────────────────────────────────────
    const pyCode = genPython(CFG, recorder, data.projects);
    const pyPath = path.join(__dirname, "behance_search.py");
    fs.writeFileSync(pyPath, pyCode, "utf-8");
    console.log(`\n📄 Python script written to: ${pyPath}`);

    // ── Save recorded actions ────────────────────────────────────────
    const actionsPath = path.join(__dirname, "recorded_actions.json");
    fs.writeFileSync(actionsPath, JSON.stringify(recorder.actions, null, 2), "utf-8");
    console.log(`📋 Recorded actions: ${actionsPath}`);

    // ── Save ParameterizedDescription ────────────────────────────────
    const descPath = path.join(__dirname, "ParameterizedDescription.txt");
    fs.writeFileSync(descPath, `Search for creative projects on Behance matching a query (e.g., "${CFG.query}"). Extract up to max_results projects with:
- title
- creator (artist name)
- appreciations (number of likes)
- views (view count)
`, "utf-8");
    console.log(`📝 ParameterizedDescription written to: ${descPath}`);

    // ── Save signature ───────────────────────────────────────────────
    const sigPath = path.join(__dirname, "signature.txt");
    fs.writeFileSync(sigPath, `@dataclass(frozen=True)
class BehanceSearchRequest:
    search_query: str = "brand identity"
    max_results: int = 5

@dataclass(frozen=True)
class BehanceProject:
    title: str = ""
    creator: str = ""
    appreciations: str = ""
    views: str = ""

@dataclass(frozen=True)
class BehanceSearchResult:
    projects: list = None  # list[BehanceProject]

def behance_search(page: Page, request: BehanceSearchRequest) -> BehanceSearchResult
`, "utf-8");
    console.log(`📝 Signature written to: ${sigPath}`);

  } catch (err) {
    console.error("❌ Error:", err.message);
  } finally {
    await stagehand.close();
  }
})();
