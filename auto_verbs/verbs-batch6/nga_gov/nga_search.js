const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  query: "Monet impressionism",
  maxResults: 5,
  waits: { page: 5000, action: 2000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
National Gallery of Art – Artwork Search
Query: "${cfg.query}"

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
class ArtworkRequest:
    query: str = "${cfg.query}"
    max_results: int = ${cfg.maxResults}


@dataclass
class Artwork:
    title: str = ""
    artist: str = ""
    date: str = ""
    medium: str = ""
    url: str = ""


@dataclass
class ArtworkResult:
    artworks: List[Artwork] = field(default_factory=list)


def nga_search(page: Page, request: ArtworkRequest) -> ArtworkResult:
    """Search NGA for artworks."""
    print(f"  Query: {request.query}\\n")

    from urllib.parse import quote_plus
    url = f"https://www.nga.gov/collection/search?keyword={quote_plus(request.query)}"
    print(f"Loading {url}...")
    checkpoint("Navigate to NGA search")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    checkpoint("Extract artwork listings")
    artworks_data = page.evaluate(r\\"\\"\\"(maxResults) => {
        const results = [];
        const seen = new Set();

        // Try finding artwork cards/items
        const items = document.querySelectorAll('article, .artwork-card, .search-result, [class*="result"], li');
        for (const item of items) {
            if (results.length >= maxResults) break;
            const link = item.querySelector('a[href*="/collection/"]') || item.querySelector('a');
            if (!link) continue;

            const text = item.innerText || '';
            const lines = text.split('\\n').map(l => l.trim()).filter(l => l.length > 1);
            if (lines.length < 1) continue;

            let title = lines[0];
            if (!title || title.length < 3 || seen.has(title)) continue;
            if (/^(search|home|sign|filter|sort|view|page)/i.test(title)) continue;
            seen.add(title);

            let artist = '', date = '', medium = '';
            for (const line of lines.slice(1)) {
                if (!artist && /^[A-Z]/.test(line) && line.length < 60) artist = line;
                else if (!date && /\\d{4}/.test(line) && line.length < 30) date = line;
                else if (!medium && /(oil|canvas|paper|watercolor|bronze|marble|print|photograph)/i.test(line)) medium = line;
            }

            const href = link.getAttribute('href') || '';
            const fullUrl = href.startsWith('/') ? 'https://www.nga.gov' + href : href;
            results.push({ title: title.slice(0, 120), artist, date, medium: medium.slice(0, 60), url: fullUrl });
        }

        // Fallback: any links with /art-object-page
        if (results.length === 0) {
            const links = document.querySelectorAll('a[href*="/art-object"]');
            for (const a of links) {
                if (results.length >= maxResults) break;
                const t = a.innerText.trim();
                if (t.length > 5 && !seen.has(t)) {
                    seen.add(t);
                    const href = a.getAttribute('href') || '';
                    const fullUrl = href.startsWith('/') ? 'https://www.nga.gov' + href : href;
                    results.push({ title: t.slice(0, 120), artist: '', date: '', medium: '', url: fullUrl });
                }
            }
        }
        return results;
    }\\"\\"\\"", request.max_results)

    artworks = [Artwork(**d) for d in artworks_data]
    result = ArtworkResult(artworks=artworks[:request.max_results])

    print("\\n" + "=" * 60)
    print(f"NGA: {request.query}")
    print("=" * 60)
    for i, a in enumerate(result.artworks, 1):
        print(f"  {i}. {a.title}")
        if a.artist:
            print(f"     Artist: {a.artist}")
        if a.date:
            print(f"     Date:   {a.date}")
        if a.medium:
            print(f"     Medium: {a.medium}")
        if a.url:
            print(f"     URL:    {a.url}")
    print(f"\\nTotal: {len(result.artworks)} artworks")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("nga_gov")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = nga_search(page, ArtworkRequest())
            print(f"\\nReturned {len(result.artworks)} artworks")
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
    const searchUrl = `https://www.nga.gov/collection/search?keyword=${encodeURIComponent(CFG.query)}`;
    console.log(`\n🌐 Loading: ${searchUrl}...`);
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url: searchUrl, description: "Navigate to NGA search" });

    const artworks = await stagehand.extract(
      `extract up to ${CFG.maxResults} artworks with title, artist, date, medium, and URL`
    );
    console.log("\n📊 Artworks:", JSON.stringify(artworks, null, 2));
    recorder.record("extract", { instruction: "Extract artworks", results: artworks });

    const dir = path.join(__dirname);
    fs.writeFileSync(path.join(dir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    console.log(`\n💾 Saved ${recorder.actions.length} actions`);

    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(dir, "nga_search.py"), pyCode);
    console.log("🐍 Saved Python script");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
