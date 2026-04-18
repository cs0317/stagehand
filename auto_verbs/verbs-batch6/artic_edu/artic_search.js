const { Stagehand } = require("@browserbasehq/stagehand");
const { PlaywrightRecorder, setupLLMClient } = require("../../stagehand-utils");
const fs = require("fs");
const path = require("path");

const CFG = {
  query: "Claude Monet",
  maxArtworks: 5,
  waits: { page: 5000 },
};

function genPython(cfg, recorder) {
  const ts = new Date().toISOString();
  const n = recorder.actions.length;
  return `"""
Auto-generated Playwright script (Python)
Art Institute of Chicago – Collection Search
Query: "${cfg.query}"

Generated on: ${ts}
Recorded ${n} browser interactions
"""

import re
import os, sys, shutil
from dataclasses import dataclass, field
from urllib.parse import quote_plus
from playwright.sync_api import sync_playwright, Page

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from cdp_utils import get_free_port, get_temp_profile_dir, launch_chrome, wait_for_cdp_ws
from playwright_debugger import checkpoint


@dataclass(frozen=True)
class ArtworkRequest:
    query: str = "${cfg.query}"
    max_artworks: int = ${cfg.maxArtworks}


@dataclass
class Artwork:
    title: str = ""
    artist: str = ""
    date: str = ""
    medium: str = ""
    url: str = ""


@dataclass
class ArtworkResult:
    artworks: list = field(default_factory=list)


def artic_search(page: Page, request: ArtworkRequest) -> ArtworkResult:
    """Search Art Institute of Chicago collection."""
    print(f"  Query: {request.query}\\n")

    url = f"https://www.artic.edu/collection?q={quote_plus(request.query)}"
    print(f"Loading {url}...")
    checkpoint("Navigate to AIC collection search")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    checkpoint("Extract artwork listings")
    artworks_data = page.evaluate(r"""(maxArtworks) => {
        const results = [];
        const items = document.querySelectorAll(
            '[class*="artwork"], article, .m-listing__item, a[href*="/artworks/"]'
        );
        const seen = new Set();
        for (const item of items) {
            if (results.length >= maxArtworks) break;
            const linkEl = item.tagName === 'A' ? item : item.querySelector('a[href*="/artworks/"]');
            const url = linkEl ? linkEl.href : '';

            const text = item.innerText || '';
            const lines = text.split('\\n').map(l => l.trim()).filter(Boolean);

            let title = lines[0] || '';
            if (!title || title.length < 2 || seen.has(title)) continue;
            seen.add(title);

            let artist = '', date = '', medium = '';
            for (const line of lines.slice(1)) {
                if (!artist && line.length > 2 && line.length < 100) {
                    artist = line;
                } else if (!date && /\\d{4}/.test(line) && line.length < 30) {
                    date = line;
                } else if (!medium && line.length > 5 && line.length < 100 && /on|oil|canvas|paper|bronze|marble/i.test(line)) {
                    medium = line;
                }
            }

            results.push({ title, artist, date, medium, url });
        }
        return results;
    }""", request.max_artworks)

    result = ArtworkResult(artworks=[Artwork(**a) for a in artworks_data])

    print("\\n" + "=" * 60)
    print(f"Art Institute of Chicago: {request.query}")
    print("=" * 60)
    for a in result.artworks:
        print(f"  {a.title}")
        print(f"    Artist: {a.artist}  Date: {a.date}")
        print(f"    Medium: {a.medium}")
        print(f"    URL: {a.url}")
    print(f"\\n  Total: {len(result.artworks)} artworks")

    return result


def test_func():
    port = get_free_port()
    profile_dir = get_temp_profile_dir("artic_edu")
    chrome_proc = launch_chrome(profile_dir, port)
    ws_url = wait_for_cdp_ws(port)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = artic_search(page, ArtworkRequest())
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
    const url = `https://www.artic.edu/collection?q=${encodeURIComponent(CFG.query)}`;
    console.log(`\n🌐 Searching: ${url}...`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(CFG.waits.page);
    recorder.record("goto", { url, description: "Search AIC collection" });

    const artData = await stagehand.extract(
      "extract up to 5 artworks with title, artist, date, medium, and artwork URL"
    );
    console.log("\n📊 Artworks:", JSON.stringify(artData, null, 2));
    recorder.record("extract", { instruction: "Extract artworks", results: artData });

    const dir = path.join(__dirname);
    fs.writeFileSync(path.join(dir, "recorded_actions.json"), JSON.stringify(recorder.actions, null, 2));
    console.log(`\n💾 Saved ${recorder.actions.length} actions`);

    const pyCode = genPython(CFG, recorder);
    fs.writeFileSync(path.join(dir, "artic_search.py"), pyCode);
    console.log("🐍 Saved Python script");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await stagehand.close();
    process.exit(0);
  }
})();
